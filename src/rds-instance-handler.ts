import {EventBridge, RDS, SNS} from 'aws-sdk';
const AWS = require('aws-sdk');
import {DBSnapshot} from "aws-sdk/clients/rds";
import {restoreInstance, targetDbInstanceModify, targetDbInstanceRestore, targetInstance} from "./config";
import {updateRdsInstanceDatabasesCredentials} from "./grant-rds-mysql-privileges";
import {RdsEventCategories} from "aws-sdk/clients/applicationinsights";

const rdsConfig = {
    apiVersion: '2014-10-31',
    region: process.env.REGION
}

const snsConfig = {
    apiVersion: '2010-03-31',
}

export let dbSnapshot = null;

const getTargetInstanceInfo = async (rds: RDS): Promise<boolean> => {
    console.log(`Getting info for target instance ${targetInstance}`);

    try {
        await rds.waitFor('dBInstanceAvailable', {
            DBInstanceIdentifier:targetInstance
        }).promise();

        const instances: RDS.Types.DBInstanceMessage = await rds.describeDBInstances({
            DBInstanceIdentifier: targetInstance
        }).promise();

        if (instances.DBInstances.length > 0) {
            const current = instances.DBInstances.shift();
            const existingSecurityGroups = current.VpcSecurityGroups
                .filter(value => (targetDbInstanceModify.VpcSecurityGroupIds.includes(value.VpcSecurityGroupId)));

            return !!existingSecurityGroups.length;
        }
    } catch (e) {
        console.log(`Could not fetch ${targetInstance} information. ${e.message}`);
    }

    return true;

}
/**
 * Check if rds instance specified created on aws
 */
const checkRestoreExistingInstance = async (rds: RDS): Promise<boolean> => {
    console.log(`Checking for an existing instance with the identifier ${restoreInstance}`);

    const instance: RDS.Types.DBInstanceMessage = await rds.describeDBInstances({
        DBInstanceIdentifier: restoreInstance
    }).promise();

    return instance.DBInstances.length > 0 && instance.DBInstances.shift().DBInstanceIdentifier == restoreInstance;
}

/**
 * Should create a new snapshot to restore it to new environment?
 */
const createSnapshot = async (rds: RDS): Promise<any> => {
    console.log(`Creating manual snapshot of ${restoreInstance}`);

    const currentDate = new Date();
    const snapshotId = `${restoreInstance}-manual-snapshot-for-staging-${currentDate.toDateString()
        .replace(/\s+/g, '-')
        .toLowerCase()}`

    const params: RDS.Types.CreateDBSnapshotMessage  = {
        DBInstanceIdentifier: restoreInstance,
        DBSnapshotIdentifier: snapshotId,
    };

    const result: RDS.Types.CreateDBSnapshotResult = await rds.createDBSnapshot(params).promise();
    await rds.waitFor('dBSnapshotAvailable', params).promise();

    console.log(`Finished creating new snapshot ${snapshotId} from ${restoreInstance}`);

    return result.DBSnapshot.DBSnapshotIdentifier;
}

/**
 * Delete target instance before restoring snapshot
 */
const deleteTargetInstance = async(rds: RDS): Promise<RDS.Types.DBInstanceMessage|void> => {
    console.log(`Deleting existing instance found with identifier ${targetInstance}`);

    if (targetInstance == restoreInstance) {
        console.log(`Nice try jackass. Exiting.`);

        return;
    }

    const params: RDS.Types.DeleteDBInstanceMessage = {
        DBInstanceIdentifier: targetInstance,
        SkipFinalSnapshot: true,
        DeleteAutomatedBackups: false
    }

    await rds.deleteDBInstance(params).promise();

    const result = await rds.waitFor('dBInstanceDeleted', {
        DBInstanceIdentifier: targetInstance
    }).promise();

    console.log(`Finished deleting ${targetInstance}`);

    return result;
}

const restoreSnapshotToTarget = async (rds: RDS, snapshotIdentifier): Promise<void> => {
    targetDbInstanceRestore.DBSnapshotIdentifier = snapshotIdentifier;

    await rds.restoreDBInstanceFromDBSnapshot(targetDbInstanceRestore).promise();
    await rds.waitFor('dBInstanceAvailable', {
        DBInstanceIdentifier: targetInstance
    }).promise();

    console.log(`Finished creating instance ${targetInstance} from snapshot ${snapshotIdentifier}`);
}


/**
 * Looking for the latest snapshot or specified
 * @param rds
 * @param snapshotIdentifier
 */
const takeLatestDbSnapshot = async (rds: RDS, snapshotIdentifier: string = null): Promise<DBSnapshot|null> => {
    console.log(`Finding latest snapshot for ${restoreInstance}`);

    const params: RDS.Types.DescribeDBSnapshotsMessage  = {
        DBInstanceIdentifier: restoreInstance
    };

    if (snapshotIdentifier) {
        params.DBSnapshotIdentifier = snapshotIdentifier;
    }

    const snapshots: RDS.Types.DBSnapshotMessage = await rds.describeDBSnapshots(params).promise();
    if (snapshots.DBSnapshots.length > 0) {
        const latest = snapshots.DBSnapshots.shift();
        console.log(`Snapshot found: ${latest.DBSnapshotIdentifier}`);

        return latest;
    }

    return null;
}

const notify = async (sns: SNS, data): Promise<void> => {
    if (!process.env.SEND_SNS_NOTIFICATION_TOPIC_ARN) {
        return;
    }

    const params = {
        Message: data.message,
        Subject: data.subject,
        TopicArn: process.env.SEND_SNS_NOTIFICATION_TOPIC_ARN
    };

    await sns.publish(params).promise();
}


/**
 * The last things is to update instance created with vpc security groups, password, ect.
 */
const modifyDbInstance = async(rds: RDS): Promise<void> => {
    await rds.modifyDBInstance(targetDbInstanceModify).promise();
    await rds.waitFor('dBInstanceAvailable', {
        DBInstanceIdentifier:targetInstance
    }).promise();

    console.log(`Finished updating ${targetInstance}`);
}

/**
 * Modify target instance
 */
export const modifyHandler = async (event) => {
    console.log(event);

    const detail = event.detail;
    if (detail.EventCategories.includes('backup')
        && detail.Message == 'Finished DB Instance backup'
        && detail.SourceIdentifier == targetInstance) {


        const rds = new AWS.RDS(rdsConfig);
        const info = await getTargetInstanceInfo(rds);
        if (!info) {
            await modifyDbInstance(rds);
            await updateRdsInstanceDatabasesCredentials();
        }
    }
}

/**
 * Main handler
 */
export const handler = async () => {
    /**
     * If you need to work with cross regions then
     * you can make another copy of rds instance with config specified.
     */
    const rds = new AWS.RDS(rdsConfig);
    const sns = new AWS.SNS(snsConfig);

    try {
        if (!await checkRestoreExistingInstance(rds)) {

           return false;
        }

        if (process.env.CREATE_LATEST_SNAPSHOT == 'true') {
            dbSnapshot = await createSnapshot(rds);
        }

        const latestSnapshot = await takeLatestDbSnapshot(rds, dbSnapshot);
        try {
            await deleteTargetInstance(rds);
        } catch (e) {
            console.log(e.message);
        }

        await restoreSnapshotToTarget(rds, latestSnapshot.DBSnapshotIdentifier);
        await notify(sns,{
            subject: "[AWS] RDS Snapshot Restored",
            message: `DB Instance: ${restoreInstance}
Region: ${rdsConfig.region}
Latest Snapshot: ${latestSnapshot.DBSnapshotIdentifier},
Restored To: ${targetInstance}`
         });
    } catch (e) {
        console.log(e);

        await notify(sns,{
            subject: "[AWS] RDS Snapshot Failed",
            message: `DB Instance: ${restoreInstance}
Region: ${rdsConfig.region}
Error: ${e.message}`
         });
    }
}
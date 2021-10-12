import AWS, {RDS} from 'aws-sdk';
import {DBSnapshot} from "aws-sdk/clients/rds";
import {restoreInstance, targetDbInstanceModify, targetDbInstanceRestore, targetInstance} from "./rds-instance-config";

const rdsConfig = {
    apiVersion: '2014-10-31',
    region: process.env.REGION
}

const snsConfig = {
    apiVersion: '2010-03-31',
}

/**
 * If you need to work with cross regions then
 * you can make another copy of rds instance with config specified.
 */
const rds = new AWS.RDS(rdsConfig);
const sns = new AWS.SNS(snsConfig);

/**
 * Check if rds instance specified created on aws
 */
const checkExistingInstance = async (): Promise<boolean> => {
    console.log(`Checking for an existing instance with the identifier ${restoreInstance}`);

    const instance: RDS.Types.DBInstanceMessage = await rds.describeDBInstances({
        DBInstanceIdentifier: restoreInstance
    }).promise();

    return instance.DBInstances.length > 0 && instance.DBInstances.shift().DBInstanceIdentifier == restoreInstance;
}

/**
 * Should create a new snapshot to restore it to new environment?
 */
const createSnapshot = async (): Promise<DBSnapshot> => {
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

    return result.DBSnapshot;
}

/**
 * Delete target instance before restoring snapshot
 */
const deleteTargetInstance = async(): Promise<RDS.Types.DBInstanceMessage|void> => {
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

const restoreSnapshotToTarget = async (snapshotIdentifier): Promise<void> => {
    targetDbInstanceRestore.DBSnapshotIdentifier = snapshotIdentifier;

    await rds.restoreDBInstanceFromDBSnapshot(targetDbInstanceRestore).promise();
    await rds.waitFor('dBInstanceAvailable', {
        DBInstanceIdentifier: targetInstance
    }).promise();

    console.log(`Finished creating instance ${targetInstance} from snapshot ${snapshotIdentifier}`);
}

/**
 * The last things is to update instance created with vpc security groups, password, ect.
 */
const modifyDbInstance = async(): Promise<void> => {
    await rds.modifyDBInstance(targetDbInstanceModify).promise();
    await rds.waitFor('dBInstanceAvailable', {
        DBInstanceIdentifier:targetInstance
    }).promise();

    console.log(`Finished updating ${targetInstance}`);
}

/**
 * Looking for the latest snapshot or specified
 * @param snapshotIdentifier
 */
const takeLatestDbSnapshot = async (snapshotIdentifier: string = null): Promise<DBSnapshot|null> => {
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

const notify = async (data): Promise<void> => {
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
 * Main handler
 * @param event
 */
export const handler = async (event) => {
    try {
        if (await checkExistingInstance()) {
            let dbSnapshot = null;
            if (process.env.CREATE_LATEST_SNAPSHOT =='true') {
                dbSnapshot = await createSnapshot();
            }

            const latestSnapshot = await takeLatestDbSnapshot(dbSnapshot);
            try {
                await deleteTargetInstance();
            } catch (e) {
                console.log(e.message);
            }

            await restoreSnapshotToTarget(latestSnapshot.DBSnapshotIdentifier);
            await modifyDbInstance();

            await notify({
                subject: "[AWS] RDS Snapshot Restored",
                message: `DB Instance: ${restoreInstance}
Region: ${rdsConfig.region}
Latest Snapshot: ${latestSnapshot.DBSnapshotIdentifier},
Restored To: ${targetInstance}`
            });
        }
    } catch (e) {
        console.log(e.message);

        await notify({
            subject: "[AWS] RDS Snapshot Failed",
            message: `DB Instance: ${restoreInstance}
Region: ${rdsConfig.region}
Error: ${e.stack}`
        });
    }
}
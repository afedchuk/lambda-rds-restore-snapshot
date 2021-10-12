import {RDS} from "aws-sdk";

export const restoreInstance = process.env.RESTORE_FROM_INSTANCE_ID;
export const targetInstance = process.env.TARGET_INSTANCE_ID;

export const targetDbInstanceRestore: RDS.Types.RestoreDBInstanceFromDBSnapshotMessage = {
    DBInstanceIdentifier: targetInstance,
    DBSnapshotIdentifier: null,
    DBInstanceClass: process.env.TARGET_DB_INSTANCE_CLASS,
    DBSubnetGroupName: process.env.TARGET_DB_SUBNET_GROUP_NAME,
}

export const targetDbInstanceModify: RDS.Types.ModifyDBInstanceMessage  = {
    DBInstanceIdentifier: targetInstance,
    ApplyImmediately: true,
    BackupRetentionPeriod: 0,
    MasterUserPassword: process.env.TARGET_DB_MASTER_PASSWORD,
    VpcSecurityGroupIds:  process.env.TARGET_DB_SECURITY_GROUPS.split(',')
}
import {RDS} from "aws-sdk";

export const restoreInstance = process.env.RESTORE_FROM_INSTANCE_ID;
export const targetInstance = process.env.TARGET_INSTANCE_ID;

export const targetDbInstanceRestore: RDS.Types.RestoreDBInstanceFromDBSnapshotMessage = {
    /**
     * The DB instance identifier.
     */
    DBInstanceIdentifier: targetInstance,

    /**
     * The identifier for the DB snapshot to restore from
     */
    DBSnapshotIdentifier: null,

    /**
     * The compute and memory capacity of the Amazon RDS DB instance
     */
    DBInstanceClass: process.env.TARGET_DB_INSTANCE_CLASS,

    /**
     * The DB subnet group name to use for the new instance.
     */
    DBSubnetGroupName: process.env.TARGET_DB_SUBNET_GROUP_NAME,

    /** A list of EC2 VPC security groups to authorize on this DB instance.
     * Put your security groups with `,` **/
    VpcSecurityGroupIds: process.env.TARGET_DB_SECURITY_GROUPS
        ? process.env.TARGET_DB_SECURITY_GROUPS.split(',')
        : [],

    /** Change accessibility here if you need **/
    PubliclyAccessible: true,
}

export const targetDbInstanceModify: RDS.Types.ModifyDBInstanceMessage  = {
    /**
     * The DB instance identifier.
     */
    DBInstanceIdentifier: targetInstance,

    /**
     * A value that indicates whether the modifications
     * in this request and any pending modifications are asynchronously applied as soon as possible
     */
    ApplyImmediately: true,

    /** Change accessibility here if you need **/
    PubliclyAccessible: true,

    /**
     * The number of days to retain automated backups.
     */
    BackupRetentionPeriod: 0
}

/**
 * MySql DB config for connecting to target DB instance and modify privileges
 */
export const targetDbConfig = {
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT ?? 3306
}
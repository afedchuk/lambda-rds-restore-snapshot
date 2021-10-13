import AWSMock from 'aws-sdk-mock';
import AWS from 'aws-sdk';
import {dbSnapshot, handler} from "./rds-instance-handler";
import * as config from "./config";

process.env.REGION = 'eu-central-1';
describe("RDS Instance", () => {
    beforeEach(() => {
        AWSMock.setSDKInstance(AWS);
        Object.defineProperty(config, 'restoreInstance', {
            value: 'db-restore-instance'
        });


        AWSMock.mock('RDS', 'describeDBInstances', (params, callback: Function) => {
            callback(null, Promise.resolve({
                ResponseMetadata: { RequestId: 'db319f37-1995-4cc1-9e6c-878405684787' },
                DBInstances: [
                    {
                        DBInstanceIdentifier: 'db-restore-instance'
                    }
                ]
            }));
        });
    });

    afterEach(() => {
        AWSMock.restore('RDS');
    });

    it('should return false if db instance not exists', async () => {
        Object.defineProperty(config, 'restoreInstance', {
            value: 'db-restore-instance-not-exists'
        });

        await expect(await handler()).toEqual(false);
    });

    it('should not create a new snapshot', async () => {
        process.env.CREATE_LATEST_SNAPSHOT = 'false';

        await handler();

        expect(dbSnapshot).toBeNull();
    });

    it('should create a new snapshot', async () => {
        process.env.CREATE_LATEST_SNAPSHOT = 'true';
        AWSMock.mock('RDS', 'createDBSnapshot', (params, callback: Function) => {
            callback(null, Promise.resolve({
                DBSnapshot: {
                    DBSnapshotIdentifier: 'db319f37-1995-4cc1-9e6c-878405684787',
                    DBInstanceIdentifier: 'db-restore-instance',
                }
            }));
        });


        AWSMock.mock('RDS', 'waitFor', (state, params, callback: Function) => {
            callback(null, Promise.resolve({
                DBSnapshots: [
                    {
                        DBSnapshotIdentifier: 'db319f37-1995-4cc1-9e6c-878405684787',
                        DBInstanceIdentifier: 'db-restore-instance',
                    }
                ]
            }));
        });

        await handler();

        expect(dbSnapshot).toEqual('db319f37-1995-4cc1-9e6c-878405684787');
    });

});

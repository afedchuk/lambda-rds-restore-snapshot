import {SSM} from 'aws-sdk';
import {targetDbConfig} from "./config";

const ssm = new SSM();
const ssmPath = process.env.SSM_PATH;
const dbServicePostPrefix = '_service';

/** Connect ro target Db as a root user to update privileges **/
const connection = async () => {
    const mysql = require('serverless-mysql')();

    mysql.config(targetDbConfig);

    await mysql.connect();

    return mysql;
}

/**
 * Get the list of users, filter and delete them
 * @param targetConnection
 */
const selectAllUsersOnTargetDbInstance = async (targetConnection): Promise<void> => {
    const promises = (await targetConnection.query(`SELECT User, Host FROM mysql.user`))
        .filter((v) => (v.Host == '%' && v.User != targetDbConfig.user))
        .map(async (v) => {

            return deleteUsersSpecifiedInTheList(targetConnection, v.User);
        });

    targetConnection.end();

    await Promise.all(promises);
}

/**
 * Clean up mysql user table
 * @param targetConnection
 * @param user
 */
const deleteUsersSpecifiedInTheList = async (targetConnection, user): Promise<void> => {
    await targetConnection.query(`DELETE FROM mysql.user WHERE User='${user}'`);

    targetConnection.end();
}

/**
 * Get all RDS instance credentials from SSM service by path,
 * specify SSM_PATH parameter to search parameters by its
 * It will work only if the path looks like that:
 * /path/{database-name}-{database-parameter}
 * where database-parameter is DB username or DB password
 */
const getUsersCredentialsFromSsm = async () => {
    const retrieveParameters = async (nextToken = null, data: {name: string, value: string}[] = []): Promise<any> => {
        const params: SSM.Types.GetParametersByPathRequest = {
            Path: ssmPath,
            WithDecryption: true,
        }

        if (nextToken) {

            /** Look if a token present to start fetch the next results from SSM. **/
            params.NextToken = nextToken;
        }

        const result =  await ssm.getParametersByPath(params).promise();
        if (result.Parameters.length == 0 ) {

            return;
        }

        data = [...data, ...result.Parameters.map(v => ({name: v.Name, value: v.Value}))];
        if (result.NextToken) {
            return await retrieveParameters(result.NextToken, data);
        }

        return data;
    }

    return await retrieveParameters();
}

const createAndGrantPermissionForMappedUsers = async (data) => {

}

/**
 * Map all parameters extracted from SSM
 */
export const updateDbInstanceUsers = async () => {

    const result = await getUsersCredentialsFromSsm();
    const mapped = [];
    result.map(value => {
        const [, , serviceCredentials] = value.name.split('/');
        const [service, parameter] = serviceCredentials.split('-');
        if (parameter == undefined) {

            return;
        }

        mapped[service] = Object.assign( mapped[service] ?? {}, {
            [parameter]: value.value
        });
    });

    const targetConnection =  await connection();
    await selectAllUsersOnTargetDbInstance(targetConnection);
    await createAndGrantPermissionForMappedUsers(mapped);

    return mapped;
}
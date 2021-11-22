import {SSM} from 'aws-sdk';
import {targetDbConfig} from "./config";
const path = require('path');
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
const selectCredentialsOnTargetDbInstance = async (targetConnection): Promise<void> => {
    const promises = (await targetConnection.query(`SELECT User, Host
                                                    FROM mysql.user`))
        .filter((v) => (v.Host == '%' && v.User != targetDbConfig.user))
        .map(async (v) => {

             return deleteUsersSpecifiedInTheList(targetConnection, v);
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
    await targetConnection.query(`REVOKE ALL PRIVILEGES, GRANT OPTION FROM '${user.User}'@'${user.Host}'`);
    await targetConnection.query(`DELETE
                                  FROM mysql.user
                                  WHERE User = '${user.User}'`);

    await targetConnection.end();
}

/**
 * Reading an execute custom queries from sql file.
 * @param targetConnection
 */
const runCustomQueries = async (targetConnection): Promise<void> => {
    const fs = require("fs");

    try {
        const dataSql = await fs.readFileSync(path.resolve(process.cwd(), './src/queries/mysql.sql')).toString();
        const data = dataSql.toString().split(";");

        let results = targetConnection.transaction();
        data.forEach(query => {
            if (query) {
                results.query(query);
            }
        });

        await results.commit();
    } catch (error) {
        console.log(`Could not run custom queries. ${error.message}`);
    }

}

/**
 * Get all RDS instance credentials from SSM service by path,
 * specify SSM_PATH parameter to search parameters by its
 * It will work only if the path looks like that:
 * /path/{database-name}-{database-parameter}
 * where database-parameter is DB username or DB password
 */
const getCredentialsFromSsm = async () => {
    const retrieveParameters = async (nextToken = null, data: { name: string, value: string }[] = []): Promise<any> => {
        const params: SSM.Types.GetParametersByPathRequest = {
            Path: ssmPath,
            WithDecryption: true,
        }

        if (nextToken) {

            /** Look if a token present to start fetch the next results from SSM. **/
            params.NextToken = nextToken;
        }

        const result = await ssm.getParametersByPath(params).promise();
        if (result.Parameters.length == 0) {

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

/**
 * It should works with a next data structure:
 * [
 *    {
 *     dbName${dbServicePostPrefix}: {
 *         user: dbUser,
 *         password: dbPassword
 *     }
 *   }
 * ]
 * @param targetConnection
 * @param data
 */
const createAndGrantPermissionsOnTargetDbInstance = async (targetConnection, data) => {
    const promises = Object.keys(data).map(async (v) => {

        await targetConnection.transaction()
            .query('FLUSH PRIVILEGES')
            .query('SELECT User, Host FROM mysql.user WHERE User = ?', [data[v]['username']])
            .query(r => {
                return ['CREATE user ?@? IDENTIFIED BY ?', [data[v]['username'], '%', data[v]['password']]]
            })
            .commit();

        await targetConnection.query(`GRANT ALL PRIVILEGES
            ON ${[v, dbServicePostPrefix].join('')}.* TO '${data[v]['username']}'`);

        await targetConnection.end();
    });

    await Promise.all(promises);

    console.log('DB users created and access granted.');
}

/**
 * Map all parameters extracted from SSM
 */
export const updateRdsInstanceDatabasesCredentials = async () => {
    const result = await getCredentialsFromSsm();
    const mapped = [];
    result.map(value => {
        const [, , serviceCredentials] = value.name.split('/');
        const [service, parameter, ...rest] = serviceCredentials.split('-');
        if (parameter == undefined) {

            return;
        }

        if (rest.length == 0) {
            mapped[service] = Object.assign(mapped[service] ?? {}, {
                [parameter]: value.value
            });
        }
    });

    const targetConnection = await connection();
    await selectCredentialsOnTargetDbInstance(targetConnection);
    await createAndGrantPermissionsOnTargetDbInstance(targetConnection, mapped);

    /** Optional step to modify db(s) data on target instance **/
    await runCustomQueries(targetConnection);

    return mapped;
}

import {SSM} from 'aws-sdk';

const ssm = new SSM();
const ssmPath = process.env.SSM_PATH;

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
            MaxResults: 10
        }

        if (nextToken) {
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

/**
 * Map all parameters extracted from SSM
 * @param event
 */
export const updateDbInstanceUsers = async (event) => {

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

    return mapped;
}
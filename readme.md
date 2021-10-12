# RDS Sync Service

Service helps to restore RDS instance snapshot created in another RDS. Useful in cases when you need to have same data on both RDS instances, of course it's not working in a way of syncing real time data
but as example you need to have staging environment and you need to work with production data without touching the data located on production RDS.

## Requirements

To run serverless commands that interface with your AWS account, you will need setup your AWS account credentials on your machine.

```
$ npm install -g serverless
```

If you are not familiar with serverless please see the guideline what is serverless is here [Serverless framework](https://www.serverless.com/framework/docs/)

## Install

```
$ yarn or npm install

```

## Deploy on AWS

`sls deploy --db-restore-instance instance-name --db-targert-instance target-instance-name
--db-instance-class db-class-type --db-subnet-group-name db-subnet-group-name --db-master-password db-master-password --db-security-groups db-security-groups`

## Usage and command line options

In your project root run to test chat locally:

`sls offline --stage development --prefix= --noPrependStageInUrl`.

It'll start server locally for testing.

## More information

You can contact [Andy Fedchuk](mailto:andriy.fedchuk@gmail.com)

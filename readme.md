# AWS RDS Sync Service

Service helps to restore AWS RDS instance snapshot created in another RDS. Useful in cases when you need to have same data on both RDS instances or make just need a copy of your running RDS instance, 
of course it's not working in a way of syncing real time data
but as example you need to have staging environment and 
you need to work with production data without touching the data located on production RDS.

It works as a cron job, it's recreating a new target RDS instance from existing one. It will check if the existing instance created, creating the latest snapshot if needed, this option you can disable in `serverless.yml` in provider section variable called `CREATE_LATEST_SNAPSHOT`.
After that a new target will restore with a latest snapshot created on existing RDS with deleting a previous target instance.

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

## Usage and command line options

In your project root run to test chat locally:

`sls offline --stage production --db-target-instance instance-name --db-restore-instance instance-name --db-instance-class db.t2.micro --db-subnet-group-name subnet-group-name --db-security-groups security-groups-ids`.

It'll start server locally for testing.

## Deploy on AWS

`sls deploy --db-restore-instance instance-name --db-targert-instance target-instance-name
--db-instance-class db-class-type --db-subnet-group-name db-subnet-group-name --db-master-password db-master-password --db-security-groups db-security-groups`

## More information

You can contact [Andy Fedchuk](mailto:andriy.fedchuk@gmail.com)

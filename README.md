# Elastic IPFS Publisher Lambda

## Deployment environment variables

_Variables in bold are required._

| Name                         | Default               | Description                                                                            |
| ---------------------------- | --------------------- | -------------------------------------------------------------------------------------- |
| **BITSWAP_PEER_MULTIADDR**   |                       | The multiaddr of the BitSwap peer to download the data from. Omit the `/p2p/...` part. |
| **HTTP_PEER_MULTIADDR**      |                       | The multiaddr of the HTTP peer to download the data from. Omit the `/p2p/...` part.    |
| ENV_FILE_PATH                | `$PWD/.env`           | The environment file to load.                                                          |
| **HANDLER**                  |                       | The operation to execute. Can be `content` or `advertisement`.                         |
| **INDEXER_NODE_URL**         |                       | The root URL (schema, host and port) of the indexer node to announce data to.          |
| NODE_DEBUG                   |                       | If it contains `aws-ipfs`, debug mode is enabled.                                      |
| NODE_ENV                     |                       | Set to `production` to disable pretty logging.                                         |
| PEER_ID_S3_BUCKET            |                       | The S3 bucket to download the BitSwap PeerID in JSON format.                           |
| S3_BUCKET                    | `advertisements`      | The S3 bucket where to upload advertisement and head information to.                   |
| SQS_ADVERTISEMENTS_QUEUE_URL | `advertisementsQueue` | The SQS topic URL to upload advertisement to for announcement.                         |

Also check [AWS specific configuration](https://github.com/elastic-ipfs/elastic-ipfs/blob/main/aws.md).

## Issues

Please report issues in the [elastic-ipfs/elastic-ipfs repo](https://github.com/elastic-ipfs/elastic-ipfs/issues).

## Contribute and release process

This is the process to contribute and get a new build deployed:

- Create a Pull Request with the intended change
- Get a review from one of the team members
- Deploy the Pull Request branch into a dev build using Github Action `Dev | Build And Deploy` and selecting branch
- Unit test Dev build lambdas [dev-ep-publishing-advertisement](https://us-west-2.console.aws.amazon.com/lambda/home?region=us-west-2#/functions/dev-ep-publishing-advertisement?tab=testing) and [dev-ep-publishing-content](https://us-west-2.console.aws.amazon.com/lambda/home?region=us-west-2#/functions/dev-ep-publishing-content?tab=testing) in AWS Console, with a given Event JSON. Validate lambda output and expected side effects.
- Merge Pull Request after being approved
- Staging release will be automatically created
- Production release will need to be authorized by one of the admins of the repo.

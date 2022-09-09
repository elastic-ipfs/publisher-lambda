# Elastic IPFS Publisher Lambda

## Deployment environment variables

_Variables in bold are required._

| Name                         | Default               | Description                                                                            |
| ---------------------------- | --------------------- | -------------------------------------------------------------------------------------- |
| **BITSWAP_PEER_MULTIADDR**   |                       | The multiaddr of the BitSwap peer to download the data from. Omit the `/p2p/...` part. |
| ENV_FILE_PATH                | `$PWD/.env`           | The environment file to load.                                                          |
| **HANDLER**                  |                       | The operation to execute. Can be `content` or `advertisement`.                         |
| **INDEXER_NODE_URL**         |                       | The root URL (schema, host and port) of the indexer node to announce data to.          |
| NODE_DEBUG                   |                       | If it contains `aws-ipfs`, debug mode is enabled.                                      |
| NODE_ENV                     |                       | Set to `production` to disable pretty logging.                                         |
| PEER_ID_DIRECTORY            | `/tmp`                | The directory of the file containing the BitSwap PeerID in JSON format.                |
| PEER_ID_FILE                 | `peerId.json`         | The filename of the file containing the BitSwap PeerID in JSON format.                 |
| PEER_ID_S3_BUCKET            |                       | The S3 bucket to download the BitSwap PeerID in JSON format.                           |
| S3_BUCKET                    | `advertisements`      | The S3 bucket where to upload advertisement and head information to.                   |
| SQS_ADVERTISEMENTS_QUEUE_URL | `advertisementsQueue` | The SQS topic URL to upload advertisement to for announcement.                         |

Also check [AWS specific configuration](https://github.com/elastic-ipfs/elastic-ipfs/blob/main/aws.md).

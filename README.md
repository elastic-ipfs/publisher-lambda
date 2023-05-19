# Elastic IPFS Publisher Lambda

> Publish IPNI advertisements and notify the indexers about all the multihashes.

## Background

Two lambdas are deployed from this repo, for the two phases of assembling and announcing an IPNI advertisement.

The first phase, called **Content**, consumes messages from the **Multihashes SQS topic** (fed by Indexer Lambda). Messages are consumed in batches (10000 items max). Each batch is uploaded as an entries file (DAG-JSON) to the **Advertisement S3 Bucket**. The CID of the entries file is published to the **Advertisement SQS topic**.

The second phase, called **Advertisement**, consumes messages from the **Advertisement SQS topic** and uploads new advertisement in order (keeping a link to the previous one) to the **Advertisement S3 Bucket**.

Once the batch has been completely consumed, the lambda finally updates the **head** DAG-JSON file on the bucket.

Finally, the lambda announces that the head has changed to the **storetheindex node**, via an http PUT to `INDEXER_NODE_URL` with the latest advertisement CID and the http multiaddr for the Advertisements bucket as the request body encoded as DAG-CBOR.

**For the architecture to work properly, the Advertisement phase must be configured to have maximum concurrency of one, to avoid concurrent head link update which result in lost announcements if the update chain is broken.**

### Provider info

The advertisements announce to the network that content is available from e-ipfs, our bitswap peer. Every advertisement includes the multiaddr and peerid for e-ipfs. We can update the multiaddr for e-ipfs by changing `BITSWAP_PEER_MULTIADDR` in the env.

**AnnounceHTTP**: We announce additional providers for our content by sending a special message to the advertisement sqs topic with the magic string `AnnounceHTTP` as the body. 

This will add an advertisement to the chain with announcing `HTTP_PEER_MULTIADDR` and signed with the keys from `peerId-http.json` in the `PEER_ID_S3_BUCKET`.

After that message is sent the indexers will add the http provider info to the results for all existing and future entries. This message only needs to be sent once.

## Getting started

Using node v16 run `npm i` and `npm test`. Use CI to publish to dev / staging / prod

## Release process

To get a new build deployed:

- Create a Pull Request with the intended change
- Get a review from one of the team members
- Deploy the Pull Request branch into a dev build using Github Action `Dev | Build And Deploy` and selecting branch
- Unit test Dev build lambdas [dev-ep-publishing-advertisement](https://us-west-2.console.aws.amazon.com/lambda/home?region=us-west-2#/functions/dev-ep-publishing-advertisement?tab=testing) and [dev-ep-publishing-content](https://us-west-2.console.aws.amazon.com/lambda/home?region=us-west-2#/functions/dev-ep-publishing-content?tab=testing) in AWS Console, with a given Event JSON. Validate lambda output and expected side effects.
- Merge Pull Request after being approved
- Staging release will be automatically created
- Production release will need to be authorized by one of the admins of the repo.

## Deployment environment variables

These are set manually on each lambda, per env, in the aws console.

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

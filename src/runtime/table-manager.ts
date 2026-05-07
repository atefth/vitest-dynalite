import {
  BatchWriteItemCommand,
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  PutItemCommand,
  ScanCommand,
  type AttributeValue,
  type CreateTableCommandInput,
  type KeySchemaElement
} from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";

import type { DynaliteConfigTable, ResetStrategy } from "../types/config.js";

interface TableSchemaShape {
  TableName: string;
  AttributeDefinitions?: CreateTableCommandInput["AttributeDefinitions"];
  KeySchema?: CreateTableCommandInput["KeySchema"];
  GlobalSecondaryIndexes?: CreateTableCommandInput["GlobalSecondaryIndexes"];
  LocalSecondaryIndexes?: CreateTableCommandInput["LocalSecondaryIndexes"];
  BillingMode?: CreateTableCommandInput["BillingMode"];
  ProvisionedThroughput?: CreateTableCommandInput["ProvisionedThroughput"];
  StreamSpecification?: CreateTableCommandInput["StreamSpecification"];
  TimeToLiveSpecification?: never;
}

function hashInput(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return hash;
}

function asSchemaShape(table: DynaliteConfigTable): TableSchemaShape {
  return {
    TableName: table.TableName ?? "",
    AttributeDefinitions: table.AttributeDefinitions,
    KeySchema: table.KeySchema,
    GlobalSecondaryIndexes: table.GlobalSecondaryIndexes,
    LocalSecondaryIndexes: table.LocalSecondaryIndexes,
    BillingMode: table.BillingMode,
    ProvisionedThroughput: table.ProvisionedThroughput,
    StreamSpecification: table.StreamSpecification
  };
}

export function createSchemaHash(tables: DynaliteConfigTable[]): string {
  const serialized = JSON.stringify(tables.map(asSchemaShape));
  return `${tables.length}:${hashInput(serialized)}`;
}

function isAttributeValue(input: unknown): input is AttributeValue {
  if (!input || typeof input !== "object") {
    return false;
  }

  const keys = Object.keys(input as object);
  if (keys.length !== 1) {
    return false;
  }

  const key = keys[0];
  return ["S", "N", "B", "BOOL", "NULL", "M", "L", "SS", "NS", "BS"].includes(key);
}

function toAttributeMap(record: Record<string, unknown>): Record<string, AttributeValue> {
  const values = Object.values(record);
  if (values.length > 0 && values.every((value) => isAttributeValue(value))) {
    return record as Record<string, AttributeValue>;
  }

  return marshall(record, {
    removeUndefinedValues: true,
    convertClassInstanceToMap: true
  });
}

function tableInput(table: DynaliteConfigTable): CreateTableCommandInput {
  const { data, ...input } = table;
  return input;
}

async function putSeedData(client: DynamoDBClient, table: DynaliteConfigTable): Promise<void> {
  if (!table.TableName || !table.data || table.data.length === 0) {
    return;
  }

  for (const row of table.data) {
    await client.send(
      new PutItemCommand({
        TableName: table.TableName,
        Item: toAttributeMap(row)
      })
    );
  }
}

export async function createTables(client: DynamoDBClient, tables: DynaliteConfigTable[]): Promise<void> {
  for (const table of tables) {
    if (!table.TableName) {
      throw new Error("Each table in vitest-dynalite config must include a TableName.");
    }

    try {
      await client.send(new CreateTableCommand(tableInput(table)));
    } catch (error) {
      if ((error as { name?: string }).name !== "ResourceInUseException") {
        throw error;
      }
    }

    await putSeedData(client, table);
  }
}

export async function deleteTables(client: DynamoDBClient, tables: DynaliteConfigTable[]): Promise<void> {
  for (const table of tables) {
    if (!table.TableName) {
      continue;
    }

    try {
      await client.send(
        new DeleteTableCommand({
          TableName: table.TableName
        })
      );
    } catch (error) {
      if ((error as { name?: string }).name !== "ResourceNotFoundException") {
        throw error;
      }
    }
  }
}

function toDeleteRequest(
  item: Record<string, AttributeValue>,
  keySchema: KeySchemaElement[]
): { DeleteRequest: { Key: Record<string, AttributeValue> } } {
  const key: Record<string, AttributeValue> = {};

  for (const keyElement of keySchema) {
    if (!keyElement.AttributeName) {
      continue;
    }

    const value = item[keyElement.AttributeName];
    if (value) {
      key[keyElement.AttributeName] = value;
    }
  }

  return {
    DeleteRequest: {
      Key: key
    }
  };
}

async function clearTable(client: DynamoDBClient, table: DynaliteConfigTable): Promise<void> {
  if (!table.TableName || !table.KeySchema || table.KeySchema.length === 0) {
    return;
  }

  let startKey: Record<string, AttributeValue> | undefined;

  do {
    const scan = await client.send(
      new ScanCommand({
        TableName: table.TableName,
        ExclusiveStartKey: startKey
      })
    );

    startKey = scan.LastEvaluatedKey;
    if (!scan.Items || scan.Items.length === 0) {
      continue;
    }

    const requests = scan.Items.map((item) => toDeleteRequest(item, table.KeySchema ?? []));

    for (let index = 0; index < requests.length; index += 25) {
      const chunk = requests.slice(index, index + 25);
      await client.send(
        new BatchWriteItemCommand({
          RequestItems: {
            [table.TableName]: chunk
          }
        })
      );
    }
  } while (startKey);
}

export async function clearAndReseedTables(client: DynamoDBClient, tables: DynaliteConfigTable[]): Promise<void> {
  for (const table of tables) {
    await clearTable(client, table);
    await putSeedData(client, table);
  }
}

export async function resetTables(
  client: DynamoDBClient,
  tables: DynaliteConfigTable[],
  strategy: ResetStrategy
): Promise<void> {
  if (strategy === "fast") {
    return;
  }

  if (strategy === "strict") {
    await deleteTables(client, tables);
    await createTables(client, tables);
    return;
  }

  await clearAndReseedTables(client, tables);
}

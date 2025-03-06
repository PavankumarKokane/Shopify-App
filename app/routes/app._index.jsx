import {
  Page,
  Layout,
  Card,
  BlockStack,
  Link,
  Text,
  Icon,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { useLoaderData } from "@remix-run/react";
import { CircleDownIcon } from "@shopify/polaris-icons";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const response = await admin.graphql(
    `#graphql
    query {
        orders(first: 20) {
            nodes {
                name
                id
                customer {
                    addresses {
                        name
                    }
                }
            }
        }
    }`,
  );

  const data = await response.json();
  return data.data.orders.nodes || null;
};

export default function Index() {
  const data = useLoaderData();
  return (
    <Page>
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <div style={{ display: "grid", gap: "1rem" }}>
              {data.map((item, index) => {
                const order_id = item.id.split("/").pop();
                return (
                  <Card key={index}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Text>{item.name}</Text>
                      <div style={{ cursor: "pointer" }}>
                        <a href={`/download/${order_id}`} target="_blank">
                          <Icon source={CircleDownIcon} tone="base" />
                        </a>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}

import { useEffect, useRef, useState } from "react";
import {
  reactExtension,
  useApi,
  AdminAction,
  BlockStack,
  Button,
  Text,
  Link,
} from "@shopify/ui-extensions-react/admin";

// The target must match the target used in the extension's toml file (./shopify.extension.toml)
const TARGET = "admin.order-details.action.render";

export default reactExtension(TARGET, () => <App />);

function App() {
  const { close, data } = useApi(TARGET);
  const [orderNumber, setOrderNumber] = useState("");
  const app_url = process.env.SHOPIFY_APP_URL;

  useEffect(() => {
    if (data && data.selected && data.selected[0] && data.selected[0].id) {
      const order_id = data.selected[0].id.split("/").pop();
      setOrderNumber(order_id); 
    }
  }, [data]);

  return (
    <AdminAction
      primaryAction={
        <Link to={`${app_url}/download/${orderNumber}`}>
          Download
        </Link>
      }
      secondaryAction={
        <Button
          onPress={() => {
            close();
          }}
        >
          Close
        </Button>
      }
    >
      <BlockStack>
        <Text>Order Number: {orderNumber}</Text>
      </BlockStack>
    </AdminAction>
  );
}
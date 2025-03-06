import fetch from "node-fetch";
const store_url = process.env.SHOPIFY_STORE_URL;

// Fetch order data from Shopify
export const fetchOrderData = async (orderId, accessToken) => {
  try {
    const response = await fetch(
      `https://${store_url}/admin/api/2023-01/orders/${orderId}.json`,
      {
        method: "GET",
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch order data: ${response.statusText}`);
    }

    const data = await response.json();
    return data; // Ensure it's a resolved JSON object
  } catch (error) {
    console.error("Error fetching order data:", error);
    throw error;
  }
};
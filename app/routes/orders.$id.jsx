import { useLoaderData } from "@remix-run/react";
import { useEffect, useState } from "react";
import prisma from "../db.server";
import "../styles/invoice.css";
import { createGraphQLClient } from "@shopify/graphql-client";

export const loader = async ({ params, request }) => {
  let accessToken;
  const store_url = process.env.SHOPIFY_STORE_URL;
  try {
    const session = await prisma.session.findFirst({
      where: {
        shop: `${store_url}`,
      },
    });

    if (!session || !session.accessToken) {
      throw new Error(`Access token not found for shop: GA4`);
    }
    accessToken = session.accessToken;
    
  } catch (error) {
    console.error("Error fetching access token:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }

  const order_id = params.id;
  const url = `https://${store_url}/admin/api/2024-04/orders/${order_id}.json`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch order data: ${response.statusText}`);
  }

  const data = await response.json();

  const client = createGraphQLClient({
    url: `https://${store_url}/admin/api/2023-01/graphql.json`,
    mode: 'no-cors',
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": `${accessToken}`,
    },
    retries: 2,
  });

  const getHSN = async (id) => {
    const productQuery = `
      query MyQuery {
        productVariant(id: "gid://shopify/ProductVariant/${id}") {
          harmonizedSystemCode
        }
      }
    `;

    const resData = await client.request(productQuery);
    return resData?.data?.productVariant?.harmonizedSystemCode;
  };

  const hsnData = await Promise.all(
    data.order.line_items.map(async (item) => ({
      id: item.variant_id,
      hsn: await getHSN(item.variant_id) || "NA",
    })),
  );

  return { order: data.order, hsn: hsnData };
};

export default function OrderDetail() {
  const { order, hsn } = useLoaderData();
  const hsnList = hsn;
  const res = order;

  const createdAt = res.created_at;
  const formattedDate = new Date(createdAt).toLocaleDateString("en-IN");
  const formatCurrency = (amount) => {
    return `Rs. ${parseFloat(amount).toFixed(2)}`;
  };

  const total_tax_amount = (line_items) => {
    let total_tax = 0;
    line_items.map((item, index) => {
      total_tax = Number(total_tax) + Number(item.price);
    });
    return total_tax;
  };

  const handlePrint = () => {
    window.print();
  };

  
  const generateLineItemRows = async () => {

    return res.line_items.map((item, index) => {
      const item_discount = item.discount_allocations[0]?.amount || 0;

      const hsnNumber =  hsnList.find((product)=> {
        return product.id == item.variant_id;
      })

      return (
        <tr key={index}>
          <td>{index + 1}</td>
          <td>{item.title}</td>
          <td>{hsnNumber.hsn}</td>
          <td>{item.price}</td>
          <td>{item.quantity}</td>
          <td>
            {(
              (item.price * item.quantity -
                Number(item_discount) -
                total_tax_amount(item.tax_lines)) /
              item.quantity
            ).toFixed(2)}
          </td>
          <td>{item_discount > 0 ? formatCurrency(item_discount) : "NA"}</td>
          <td>
            {(
              item.price * item.quantity -
              Number(item_discount) -
              total_tax_amount(item.tax_lines)
            ).toFixed(2)}
          </td>
          <td>
            {item.tax_lines
              .map((item) => {
                if (item.title == "SGST") {
                  return parseFloat(item.rate * 100).toFixed(2);
                }
              })
              .join("") || "0.00"}
          </td>
          <td>
            {item.tax_lines
              .map((item) => {
                if (item.title == "SGST") {
                  return item.price;
                }
              })
              .join("") || "NA"}
          </td>
          <td>
            {item.tax_lines
              .map((item) => {
                if (item.title == "CGST") {
                  return parseFloat(item.rate * 100).toFixed(2);
                }
              })
              .join("") || "0.00"}
          </td>
          <td>
            {item.tax_lines
              .map((item) => {
                if (item.title == "CGST") {
                  return item.price;
                }
              })
              .join("") || "NA"}
          </td>
          <td>
            {item.tax_lines
              .map((item) => {
                if (item.title == "IGST") {
                  return parseFloat(item.rate * 100).toFixed(2);
                }
              })
              .join("") || "0.00"}
          </td>
          <td>
            {item.tax_lines
              .map((item) => {
                if (item.title == "IGST") {
                  return item.price;
                }
              })
              .join("") || "NA"}
          </td>
          <td>
            {(item.price * item.quantity - Number(item_discount)).toFixed(2)}
          </td>
        </tr>
      );
    });
  };

  const calculateTotalPrice = () => {
    return res.total_price;
  };

  const [rowHTML, setRowHTML] = useState(null);
  useEffect(() => {
    
    const fetchData = async () => {
      const rows = await generateLineItemRows();
      setRowHTML(rows);
    };

    if (res) {
      fetchData();
    }
  }, [res]);

  if (!rowHTML) {
    return (
      <div>
        <img className="loading-img" src="/loading.gif" alt="loading" />
      </div>
    );
  }

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          fontSize: "20px",
          fontWeight: "800",
          marginBottom: "20px",
        }}
      >
        Tax Invoice
      </div>
      <table>
        <tbody>
          <tr>
            <td style={{ fontSize: "14px", fontWeight: 700 }}>Store Name</td>
            <td style={{ direction: "rtl" }}>{formattedDate}</td>
          </tr>
          <tr>
            <td rowSpan="3">
              Test 1
              <br />
              Test 2
              <br />
              Test 3
              <br />
            </td>
          </tr>
          <tr>
            <td style={{ direction: "rtl" }}>Order ID {res.name}</td>
          </tr>
          <tr>
            <td style={{ direction: "rtl" }}>GST: 27AADCA3120F1ZA</td>
          </tr>
        </tbody>
      </table>
      <p
        style={{
          margin: "20px 0 10px",
          borderTop: "1px solid #000",
          height: "1px",
        }}
      ></p>

      <table className="product-table">
        <thead>
          <tr>
            <th colSpan={15}>
              <h2
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  textAlign: "left",
                }}
              >
                Product Details
              </h2>
            </th>
          </tr>
          <tr>
            <th>Sr. No.</th>
            <th>Product Name</th>
            <th>HSN Code</th>
            <th>MRP (Rs.)</th>
            <th>Qty</th>
            <th>Rate (Rs.)</th>
            <th>Discount Amt(Rs.)</th>
            <th>Taxable Amt (Rs.)</th>
            <th colSpan={2}>SGST</th>
            <th colSpan={2}>CGST</th>
            <th colSpan={2}>IGST</th>
            <th>Total Amt (Rs.)</th>
          </tr>
          <tr>
            <th></th>
            <th></th>
            <th></th>
            <th></th>
            <th></th>
            <th></th>
            <th></th>
            <th></th>
            <th>(%)</th>
            <th>Amt (Rs.)</th>
            <th>(%)</th>
            <th>Amt (Rs.)</th>
            <th>(%)</th>
            <th>Amt (Rs.)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>{rowHTML}</tbody>
      </table>
      <h2
        style={{ fontSize: "10px", fontWeight: 700, margin: "20px 0 10px" }}
      ></h2>
      <table className="payment-details">
        <tbody>
          <tr>
            <th colSpan={2}>
              <h2 style={{ fontSize: "10px", fontWeight: 700 }}>
                {" "}
                Payment Details
              </h2>
            </th>
          </tr>
          <tr>
            <td>Subtotal price:</td>
            <td>{formatCurrency(res.subtotal_price)}</td>
          </tr>
          <tr>
            <td>Discount (-)</td>
            <td>
              {res.total_discounts > 0
                ? formatCurrency(res.total_discounts)
                : "NA"}
            </td>
          </tr>
          <tr>
            <td>Shipping:</td>
            <td>
              {formatCurrency(res.total_shipping_price_set.shop_money.amount)}
            </td>
          </tr>
          <tr>
            <td>Total tax:</td>
            <td>
              {formatCurrency(res.total_tax)}{" "}
              {res.total_shipping_price_set.shop_money.amount == 0
                ? ""
                : `+ 7.27 (Shipping GST) = ${formatCurrency(
                    res.total_tax * 1 + 7.27,
                  )}`}
            </td>
          </tr>

          <tr>
            <th>Total price (Inclusive Tax):</th>
            <th>{formatCurrency(calculateTotalPrice())}</th>
          </tr>
        </tbody>
      </table>
      <table className="billTable" style={{ marginTop: "20px" }}>
        <thead>
          <tr>
            <th>
              <p style={{ fontSize: "10px", fontWeight: 700, margin: "5px 0" }}>
                Bill To :
              </p>
            </th>
            <th>
              <p style={{ fontSize: "10px", fontWeight: 700, margin: "5px 0" }}>
                Ship To :
              </p>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <p style={{ fontSize: "8px", margin: 0, width: "90%" }}>
                {res.billing_address.address1} {res.billing_address.address2}{" "}
                <br />
                {res.billing_address.city} {res.billing_address.province} <br />
                {res.billing_address.zip} {res.billing_address.country}
                <br />
                Mob No. : {res.billing_address.phone}
                <br />
                Email : {res.customer?.email}
              </p>
            </td>
            <td>
              <p style={{ fontSize: "8px", margin: 0, width: "90%" }}>
                {res.shipping_address.address1} {res.shipping_address.address2}{" "}
                <br />
                {res.shipping_address.city} {res.shipping_address.province}{" "}
                <br />
                {res.shipping_address.zip} {res.shipping_address.country}
                <br />
                Mob No. : {res.shipping_address.phone}
                <br />
                Email : {res.customer?.email}
              </p>
            </td>
          </tr>
        </tbody>
      </table>
      <p style={{ fontSize: "12px", fontWeight: 700, margin: "20px 0 10px" }}>
        Terms & Conditions:
      </p>
      <ol style={{ fontSize: "8px", margin: 0 }}>
        <li>
          Please Check the Goods Properly while Obtaining the delivery. No
          claims will be entertained for Shortage / Damage after 2 days from the
          receipt of the goods.
        </li>
        <li>
          Goods once sold may be taken back only if they are in conformity to
          return policy as disclosed on www.amarantha.in
        </li>
        <li>Any overcharges / undercharges will be refunded / recovered.</li>
        <li>
          Price and terms of sale of are subject to change without any notice.
          Price & terms prevailing on the date of invoice shall be applicable.
        </li>
        <li>
          We do not advocate self-medication under any circumstances. Goods are
          sold on the understanding that the buyer has been advised their use by
          a physician.
        </li>
        <li>All disputes are subject to Pune jurisdiction.</li>
        <li>E & O E.</li>
      </ol>
      <p style={{ fontSize: "8px", fontWeight: 400, margin: "20px 0 10px" }}>
        If you have any questions, please send an email to{" "}
        <a href="mailto:info@amarantha.in">info@amarantha.in</a>
      </p>

      <h3>Declaration :</h3>
      <p>
        I/We hereby certify that my/our registration certificate under these
        rules is in force on the date on which the sale of the goods specified
        in this bill/invoice/cash memorandum, is made by me/us and that the
        transaction of sale covered by this bill/invoice/cash memorandum, has
        been effected by me/us in the course of my/our business.
      </p>
      <div style={{ display: "block", float: "right", direction: "rtl" }}>
        <h2
          style={{ fontSize: "10px", fontWeight: 700, margin: "30px 0 10px" }}
        >
          For Store Name
        </h2>
        <p style={{ fontSize: "8px", fontWeight: 400, margin: "40px 0 0" }}>
          Authorised Singnatory <br />
        </p>
      </div>
      <button className="print-button" onClick={handlePrint}>
        Print
      </button>
    </>
  );
}
import { json } from "@remix-run/node";
import puppeteer from "puppeteer-core";
import prisma from "../db.server";
import chromium from "@sparticuz/chromium";
import { fetchOrderData } from "../utils/api"; // Ensure correct import paths

export const loader = async ({ params }) => {
  let accessToken;
  const store_url = process.env.SHOPIFY_STORE_URL;
  try {
    const session = await prisma.session.findFirst({
      where: {
        shop: `${store_url}`,
      },
    });

    if (!session || !session.accessToken) {
      throw new Error(`Access token not found for shop`);
    }
    accessToken = session.accessToken;
  } catch (error) {
    console.error("Error fetching access token:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }

  try {
    // Fetch order data and HSN data (ensure both are awaited)
    const [orderData] = await Promise.all([
      fetchOrderData(params.id, accessToken),
    ]);

    const res = orderData.order;

    //console.log(res);

    const createdAt = res.created_at;
    const formattedDate = new Date(createdAt).toLocaleDateString("en-GB");
    const formatCurrency = (amount) => {
      return `Rs. ${parseFloat(amount).toFixed(2)}`;
    };

    var SGST = 0;
    var CGST = 0;
    var IGST = 0;

    var SP = res.total_shipping_price_set.shop_money.amount * 1;
    var SPtax = parseFloat(SP - SP * 1 * 0.8472);

    var SP = res.total_shipping_price_set.shop_money.amount * 1;
    console.log("SPtax:", SPtax);

    var SumOfSGST = 0;
    var SumOfCGST = 0;
    var SumOfIGST = 0;
    var SumOfAmt = 0;

    const total_tax_amount = (line_items) => {
      let total_tax = 0;
      line_items.map((item, index) => {
        total_tax = Number(total_tax) + Number(item.price);
      });
      return total_tax;
    };

    res.line_items.map((item, index) => {
      if (item.current_quantity != 0) {
        let item_discount = 0;

        // const item_discount = item.discount_allocations[0]?.amount || 0;
        item.discount_allocations.forEach((ele, indx) => {
          item_discount = item_discount + ele.amount * 1;
        });

        const IGST_sgstItem = item.tax_lines.find(
          (taxLine) => taxLine.title === "IGST",
        );
        if (!IGST_sgstItem) {
          const SGST_sgstItem = item.tax_lines.find(
            (taxLine) => taxLine.title === "SGST",
          );
          const CGST_sgstItem = item.tax_lines.find(
            (taxLine) => taxLine.title === "CGST",
          );
          let total =
            ((item.price - Number(item_discount) / item.current_quantity) *
              ((SGST_sgstItem.rate + CGST_sgstItem.rate) * 100)) /
            (100 + (SGST_sgstItem.rate + CGST_sgstItem.rate) * 100);

          SumOfAmt =
            SumOfAmt +
            (
              item.price -
              Number(item_discount) / item.current_quantity -
              total
            ).toFixed(2) *
              item.current_quantity;

          SumOfSGST =
            SumOfSGST +
            (((item.price - Number(item_discount) / item.current_quantity) *
              (SGST_sgstItem.rate * 100)) /
              (100 + (SGST_sgstItem.rate + CGST_sgstItem.rate) * 100)) *
              item.current_quantity;

          SumOfCGST =
            SumOfCGST +
            (((item.price - Number(item_discount) / item.current_quantity) *
              (CGST_sgstItem.rate * 100)) /
              (100 + (SGST_sgstItem.rate + CGST_sgstItem.rate) * 100)) *
              item.current_quantity;
        } else {
          let total =
            ((item.price - Number(item_discount) / item.current_quantity) *
              (IGST_sgstItem.rate * 100)) /
            (100 + IGST_sgstItem.rate * 100);
          SumOfAmt =
            SumOfAmt +
            (
              item.price -
              Number(item_discount) / item.current_quantity -
              total
            ).toFixed(2) *
              item.current_quantity;

          SumOfIGST =
            SumOfIGST +
            (((item.price - Number(item_discount) / item.current_quantity) *
              (IGST_sgstItem.rate * 100)) /
              (100 + IGST_sgstItem.rate * 100)) *
              item.current_quantity;
        }
      }
    });

    if (SumOfIGST > 0) {
      IGST = SPtax;
    } else {
      CGST = SPtax / 2.0;
      SGST = SPtax / 2.0;
    }

    const generateLineItemRows = () => {
      return res.line_items
        .map((item, index) => {
          let item_discount = 0;

          // const item_discount = item.discount_allocations[0]?.amount || 0;
          item.discount_allocations.forEach((ele, indx) => {
            item_discount = item_discount + ele.amount * 1;
          });

          if (item.current_quantity != 0) {
            return `
          <tr key=${index}>
          <td>${index + 1}</td>
          <td>${item.title}</td>
          <td>${item?.sku || "NA"}</td>
          <td>${item.price}</td>
          <td>${
            item.current_quantity >= 0 ? item.current_quantity : item.quantity
          }</td>
          <td>
            ${(() => {
              const IGST_sgstItem = item.tax_lines.find(
                (taxLine) => taxLine.title === "IGST",
              );
              if (!IGST_sgstItem) {
                const SGST_sgstItem = item.tax_lines.find(
                  (taxLine) => taxLine.title === "SGST",
                );
                const CGST_sgstItem = item.tax_lines.find(
                  (taxLine) => taxLine.title === "CGST",
                );
                let total =
                  ((item.price -
                    Number(item_discount) / item.current_quantity) *
                    ((SGST_sgstItem.rate + CGST_sgstItem.rate) * 100)) /
                  (100 + (SGST_sgstItem.rate + CGST_sgstItem.rate) * 100);
                return total > 0
                  ? (
                      item.price -
                      Number(item_discount) / item.current_quantity -
                      total
                    ).toFixed(2)
                  : "NA";
              } else {
                let total =
                  ((item.price -
                    Number(item_discount) / item.current_quantity) *
                    (IGST_sgstItem.rate * 100)) /
                  (100 + IGST_sgstItem.rate * 100);
                console.log(total);
                return total > 0
                  ? (
                      item.price -
                      Number(item_discount) / item.current_quantity -
                      total
                    ).toFixed(2)
                  : "NA";
              }
            })()}
          </td>
          <td>${
            item_discount > 0 ? parseFloat(item_discount).toFixed(2) : "NA"
          }</td>
          <td>
              ${(() => {
                const IGST_sgstItem = item.tax_lines.find(
                  (taxLine) => taxLine.title === "IGST",
                );
                if (!IGST_sgstItem) {
                  const SGST_sgstItem = item.tax_lines.find(
                    (taxLine) => taxLine.title === "SGST",
                  );
                  const CGST_sgstItem = item.tax_lines.find(
                    (taxLine) => taxLine.title === "CGST",
                  );
                  let total =
                    ((item.price -
                      Number(item_discount) / item.current_quantity) *
                      ((SGST_sgstItem.rate + CGST_sgstItem.rate) * 100)) /
                    (100 + (SGST_sgstItem.rate + CGST_sgstItem.rate) * 100);
                  return total > 0
                    ? (
                        (item.price -
                          Number(item_discount) / item.current_quantity -
                          total) *
                        item.current_quantity
                      ).toFixed(2)
                    : "NA";
                } else {
                  let total =
                    ((item.price -
                      Number(item_discount) / item.current_quantity) *
                      (IGST_sgstItem.rate * 100)) /
                    (100 + IGST_sgstItem.rate * 100);
                  return total > 0
                    ? (
                        (item.price -
                          Number(item_discount) / item.current_quantity -
                          total) *
                        item.current_quantity
                      ).toFixed(2)
                    : "NA";
                }
              })()}
          </td>
            <td>
              ${(() => {
                const sgstItem = item.tax_lines.find(
                  (taxLine) => taxLine.title === "SGST",
                );
                return sgstItem
                  ? parseFloat(sgstItem.rate * 100).toFixed(2)
                  : "0.00";
              })()}
            </td>
            <td>
              ${(() => {
                const IGST_sgstItem = item.tax_lines.find(
                  (taxLine) => taxLine.title === "IGST",
                );
                if (!IGST_sgstItem) {
                  const SGST_sgstItem = item.tax_lines.find(
                    (taxLine) => taxLine.title === "SGST",
                  );
                  const CGST_sgstItem = item.tax_lines.find(
                    (taxLine) => taxLine.title === "CGST",
                  );
                  let total =
                    ((item.price -
                      Number(item_discount) / item.current_quantity) *
                      (SGST_sgstItem.rate * 100)) /
                    (100 + (SGST_sgstItem.rate + CGST_sgstItem.rate) * 100);
                  return total > 0
                    ? (total * item.current_quantity).toFixed(2)
                    : "NA";
                } else {
                  return "NA";
                }
              })()}
          </td>
          <td>
            ${(() => {
              const sgstItem = item.tax_lines.find(
                (taxLine) => taxLine.title === "CGST",
              );
              return sgstItem
                ? parseFloat(sgstItem.rate * 100).toFixed(2)
                : "0.00";
            })()}
            </td>
            <td>

            ${(() => {
              const IGST_sgstItem = item.tax_lines.find(
                (taxLine) => taxLine.title === "IGST",
              );
              if (!IGST_sgstItem) {
                const SGST_sgstItem = item.tax_lines.find(
                  (taxLine) => taxLine.title === "SGST",
                );
                const CGST_sgstItem = item.tax_lines.find(
                  (taxLine) => taxLine.title === "CGST",
                );
                let total =
                  ((item.price -
                    Number(item_discount) / item.current_quantity) *
                    (CGST_sgstItem.rate * 100)) /
                  (100 + (SGST_sgstItem.rate + CGST_sgstItem.rate) * 100);
                return total > 0
                  ? (total * item.current_quantity).toFixed(2)
                  : "NA";
              } else {
                return "NA";
              }
            })()}
            
            </td>
          <td>
            ${(() => {
              const sgstItem = item.tax_lines.find(
                (taxLine) => taxLine.title === "IGST",
              );
              return sgstItem
                ? parseFloat(sgstItem.rate * 100).toFixed(2)
                : "0.00";
            })()}
              </td>
              <td>

              ${(() => {
                const IGST_sgstItem = item.tax_lines.find(
                  (taxLine) => taxLine.title === "IGST",
                );
                if (IGST_sgstItem) {
                  let total =
                    ((item.price -
                      Number(item_discount) / item.current_quantity) *
                      (IGST_sgstItem.rate * 100)) /
                    (100 + IGST_sgstItem.rate * 100);
                  return total > 0
                    ? (total * item.current_quantity).toFixed(2)
                    : "NA";
                } else {
                  return "NA";
                }
              })()}
              
              </td>
          <td>${(
            (item.price - Number(item_discount) / item.current_quantity) *
            item.current_quantity
          ).toFixed(2)}</td>
        </tr>

        `;
          }
        })
        .join("");
    };

    const generateProductCombo = () => {
      return res.line_items
        .filter((item) => item.title.toLowerCase().includes("combo")) // Filter items with 'combo' in title
        .map((item, index) => {
          return `<tr key=${index}>
          <td align="center">${index + 1}</td>
          <td>${item.title}</td>
          <td>${product_list[index] !== undefined ? product_list[index] : "NA"}</td>
          </tr>`;
        })
        .join("");
    };

    // Function to calculate total price
    const calculateTotalPrice = () => {
      return res.current_total_price
        ? res.current_total_price
        : res.total_price;
    };

    const getTotalDiscount = (discount_allocations_array) => {
      // console.log("discountarray: ",discount_allocations_array)
      let value = "";
      discount_allocations_array.forEach((ele, indx) => {
        if (ele.type == "automatic") {
          value = ele.title;
        }
      });
      return value;
    };

    // Function to generate HTML content dynamically
    const generateHTMLContent = () => {
      return `
    <!DOCTYPE html>
    <html lang="en">
        <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Invoice-${res.id}</title>
            <style>
                html,
                body {
                    margin: 0;
                    padding: 0;
                    font-family: Serif;
                    font-size: 10px;
                    color:#000;
                }
                table {
                    width: 100%;
                }
                .product-table th,
                .payment-details th
                .billTable th {
                    background-color: #f2f2f2;
                }
                .product-table,
                .payment-details,
                .billTable {
                    border-collapse: collapse;
                }
                .product-table th,
                .product-table td,
                .payment-details th,
                .payment-details td,
                .billTable td,
                .billTable th {
                    text-align: left;
                    border: 0.1px solid #D1D1D1;
                    padding: 5px;
                    
                }
                .product-table th{
                  text-align: center;
                }
                th{
                  background-color: #f2f2f2;
                }

                h2{
                  margin : 0px;
                }
                p{
                  margin:0px;
                }
                .product-combo td span{
                  padding-left: 10px;
                }
            </style>
        </head>
        <body style="padding: 4%;">
        <div style="display:flex; justify-content:center;font-size: 20px; font-weight:800; margin-botton: 20px">Tax Invoice</div>
        <table>
                <tr>
                    <td style="font-size: 14px; font-weight: 700;">Amura Invoice App</td>
                    <td style="direction: rtl;">Order Date:  ${formattedDate}
                 </td>
                </tr>
                <tr>
                <td style="vertical-align: baseline; " rowSpan="5">
                Test 1
                <br />
                Test 2
                <br />
                Test 3
                <br/>
                GST: 27AADCA3120F1ZA 
                 </td>
                
                 <td style="direction: rtl;">Order No.:  ${res.name}</td>

                </tr>
                  
            </tr>
                <tr>
                <td style="direction: rtl;">Invoice No.:  ${res.id}</td>
                   
                </tr>                
             
                <tr>
                <td style="direction: rtl;">Place of Supply: ${
                  res.shipping_address.city + "," || ""
                } ${res.shipping_address.province || ""} ${
                  "- " + res.shipping_address.province_code
                } </td>
            </tr>
                <tr> 
                <td style="direction: rtl;">Terms of Delivery:  ${
                  res.payment_gateway_names == "CCAvenue"
                    ? "Prepaid"
                    : res.payment_gateway_names
                }
                  </td>
            </tr>
            
               
               
            </table>
            <p style="margin: 20px 0 10px; border-top: 0.5px solid #D1D1D1; height: 1px;"></p>
          
            <table class = "billTable" style= "margin-top:20px">
            <thead>
             <tr>
                <th>
                  <p style="font-size:16px;font-weight: 700; margin:0px">
                   Bill To :
                  </p>
                </th>

                <th>
                  <p style="font-size:16px; font-weight: 700; margin:0px">
                    Ship To :
                  </p>
                  </th>
            <tbody>
              <tr>
                <td>
                 
                  <p style="font-size:14px;font-weight: 600; margin:0px;width:90%">
                  ${res.billing_address?.name || ""}<br/>
                    ${res.billing_address?.address1 || ""} ${
                      res.billing_address?.address2 || ""
                    }${" "}
                    <br />
                    ${res?.billing_address?.city || ""} ${
                      res.billing_address?.province || ""
                    } <br />
                    ${res.billing_address.zip || ""} ${
                      res.billing_address.country || ""
                    }
                    <br />
                    Mob No. : ${res.billing_address.phone || ""}
                    <br />
                    ${res.customer?.email ? `Email: ${res.customer.email}` : ""}
                  </p>
                </td>
                <td>
                  <p style="font-size:14px;font-weight: 600; margin:0px;width:90%">
                  ${res.shipping_address.name || ""} 
                  <br/>
                    ${res.shipping_address.address1 || ""} ${
                      res.shipping_address.address2 || ""
                    }${" "}
                    <br />
                    ${res.shipping_address.city || ""} ${
                      res.shipping_address.province || ""
                    }${" "}
                    <br />
                    ${res.shipping_address.zip || ""} ${
                      res.shipping_address.country || ""
                    }
                    <br />
                    Mob No. : ${res.shipping_address.phone || ""}
                    <br />
                    ${res.customer?.email ? `Email: ${res.customer.email}` : ""}
                  </p>
                </td>
              </tr>
            </tbody>
          </table>


            <table class="product-table" style="margin:20px 0px ">
            <thead>
            <tr>
            <th colSpan="19" style="text-align:left">
              <h2
                style="
                  font-size: 10px;
                  font-weight: 700;
                  text-align:left
               "
              >
                Product Details
              </h2>
            </th>
          </tr>        
                <tr>
                    <th>Sr. No.</th>
                    <th>Product Name</th>
                    <th>Pack Size</th>
                    <th>MRP (Rs.)</th>
                    <th>Qty</th>
                    <th>Rate (Rs.)</th>
                    <th>Discount Amt (Rs.)</th>
                    <th>Taxable Amt (Rs.)</th>
                    <th colspan="2">SGST</th>
                    <th colspan="2">CGST</th>
                    <th colspan="2">IGST</th>
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
              <thead>
                <tbody>
                ${generateLineItemRows()}
                <tr> 
                    <th colspan="7" style="text-align: right;">Total </th>
                    <th style= "font-weight=700;text-align:left">${
                        SumOfAmt == 0 ? "" : parseFloat(SumOfAmt).toFixed(2)
                    }</th>
                    <td></td>
                    <th style= "fontWeight="600">${
                        SumOfSGST == 0 ? "" : parseFloat(SumOfSGST).toFixed(2)
                    }</th>
                    <td></td>
                    <th style= "fontWeight="600">${
                        SumOfCGST == 0 ? "" : parseFloat(SumOfCGST).toFixed(2)
                    }</th>
                    <td></td>
                    <th style= "fontWeight="600">${
                        SumOfIGST == 0 ? "" : parseFloat(SumOfIGST).toFixed(2)
                    }</th>
                    <th style= "fontWeight="600">${parseFloat(
                        res.current_subtotal_price
                        ? res.current_subtotal_price
                        : res.subtotal_price,
                    ).toFixed(2)}</th>
          
                </tr>
                </tbody>
            </table>
            <h2 style="font-size: 10px; font-weight: 700; margin: 20px 0 10px;"></h2>
            <table class="payment-details">
               <tr>
               <td colSpan="2">
               <h2 style="font-size:10px; font-weight: 700"> 
                 Payment Details
               </h2>
             </td>
               </tr>
                <tr>
                    <td style="width:40%">Subtotal (inclusive of all taxes):</td>
                    <td>${
                      res.total_discounts > 0
                        ? formatCurrency(
                            res.current_subtotal_price * 1 +
                              res.total_discounts * 1,
                          )
                        : formatCurrency(res.current_subtotal_price)
                    }</td>
                </tr>
                <tr>
                    <td>Discount:
                    ${res.discount_applications.map((ele, indx) => {
                      return `${ele.code || ele.title} `;
                    })}</td>
                    <td>${
                      res.total_discounts > 0
                        ? formatCurrency(res.total_discounts)
                        : "NA"
                    }</td>
                </tr>
               
                <tr>
                    <td>Shipping Charges :</td>
                    <td>
              ${formatCurrency(
                res.total_shipping_price_set.shop_money.amount,
              )} ${
                res.total_shipping_price_set.shop_money.amount == 0
                  ? ""
                  : `( Shipping charges ${(SP - SPtax).toFixed(2)}  ${
                      IGST > 0
                        ? ` + IGST ${IGST.toFixed(2)}`
                        : ` +  CGST  ${CGST.toFixed(2)} + SGST  ${SGST.toFixed(2)}`
                    } ) `
              }
              
            </td>
            </tr>
            <tr>
            <td>Total GST:</td>
            <td>${
              res.current_total_tax
                ? formatCurrency(res.current_total_tax)
                : formatCurrency(res.total_tax * 1.0 + SPtax)
            }  
         </td>
        </tr>
                <tr>
                    <th>Total price:</th>
                    <th>${formatCurrency(calculateTotalPrice())}</th>
                </tr>
                <tr>
                     <td>Payment Mode:</td>
                     <td style="text-transform:capitalize">${res.payment_gateway_names == "CCAvenue" ? "Online" : res.payment_gateway_names}</td>
                </tr>
            </table>

            ${
              generateProductCombo()
                ? `<table class="payment-details product-combo" style="margin: 20px 0px 20px;">
                      <tr>
                        <td colSpan="3">
                          <h2 style="font-size:10px; font-weight: 700"> 
                            Combo Product Details
                          </h2>
                        </td>
                      </tr>
                      ${generateProductCombo()}
                    </table>`
                : ""
            }

                       
            <p style="font-size: 10px; font-weight: 700; margin: 10px 0px 10px;">Terms & Condions:</p>
            <ol style="font-size: 8px; margin: 0;">
                <li>Please Check the Goods Properly while Obtaining the delivery. No claims will be entertained for Shortage / Damage after 2 days from the receipt of the goods.</li>
                <li>Goods once sold may be taken back only if they are in confirmity to return policy as disclosed on www.amarantha.in </li>
                <li>Any overcharges / undercharges will be refunded / recovered.</li>
                <li>Price and terms of sale of are subject to change without any notice. Price & terms prevailing on the date of invoice shall be applicable.</li>
                <li>We do not advocate self-medication under any circumstances. Goods are sold on the understanding that the buyer has been advised their use by a physician.</li>
                <li>All disputes are subject to Pune jurisdiction.</li>
                <li>E & O E.</li>
            </ol>
            <p style="font-size: 8px; font-weight: 400; margin: 10px 0 10px;">If you have any questions, please send an email to <a href="mailto:info@amarantha.in">info@amarantha.in</a></p>

            <h2 style="font-size: 10px; margin :0px 0px 10px">Declaration :</h2>
      <p style="font-size: 8px;">
        I/We hereby certify that my/our registration certificate under these
        rules is in force on the date on which the sale of the goods specified
        in this bill/invoice/cash memorandum, is made by me/us and that the
        transaction of sale covered by this bill/invoice/cash memorandum, has
        been effected by me/us in the course of my/our business.
      </p>


            <div style="display: block; float: right; direction: rtl;">
                <h2 style="font-size: 10px; font-weight: 700; margin: 30px 0 10px;">
                    For Amura Invoice
                </h2>
                <p style="font-size: 8px; font-weight: 400; margin: 40px 0 10px;">
                    Authorised Singnatory 
                </p>
            </div>
        </body>
    </html>    
  `;
    };

    const invoiceHtml = generateHTMLContent();
    
    // Launch Puppeteer for PDF generation
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setContent(invoiceHtml, { waitUntil: "networkidle0" });

    const pdf = await page.pdf({ format: "A4", printBackground: true });

    await browser.close();

    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=invoice_${orderData.order.id}.pdf`,
      },
    });
  } catch (error) {
    console.error("Error generating invoice:", error);
    return json({ error: "Failed to generate invoice" }, { status: 500 });
  }
};

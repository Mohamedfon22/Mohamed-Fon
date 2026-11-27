
const WHATSAPP = "201067936382";
let cart = [];
let adminToken = "";

const $ = (id) => document.getElementById(id);

async function api(url, options = {}) {
  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}),
    ...options.headers
  };

  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "حدث خطأ. حاول مرة أخرى.");
  }
  return data;
}

function notify(message) {
  alert(message);
}

function money(value) {
  return Number(value || 0).toLocaleString("ar-EG") + " جنيه";
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

async function loadProducts() {
  const grid = $("productGrid");
  try {
    const result = await api("/api/products");
    const products = result.products || [];

    grid.innerHTML = products.length
      ? products.map(product => `
        <article class="product-card">
          ${product.image_url
            ? `<img src="${escapeHTML(product.image_url)}" alt="${escapeHTML(product.name)}">`
            : ""}
          <h3>${escapeHTML(product.name)}</h3>
          <p>${escapeHTML(product.description || "")}</p>
          <strong>${money(product.price)}</strong>
          <button class="btn" onclick="addToCart('${String(product.id).replace(/'/g, "")}')">
            أضف إلى السلة
          </button>
        </article>
      `).join("")
      : "لا توجد منتجات حاليًا.";
    window.products = products;
  } catch {
    grid.textContent = "تعذر تحميل المنتجات حاليًا. يرجى المحاولة لاحقًا.";
  }
}

window.addToCart = function(id) {
  const product = (window.products || []).find(item => String(item.id) === String(id));
  if (!product) return;

  const existing = cart.find(item => String(item.id) === String(id));
  if (existing) existing.quantity++;
  else cart.push({ ...product, quantity: 1 });

  renderCart();
};

function renderCart() {
  $("cartCount").textContent = cart.reduce((sum, item) => sum + item.quantity, 0);

  $("cartItems").innerHTML = cart.length
    ? cart.map(item => `
      <div class="cart-item">
        <span>${escapeHTML(item.name)} × ${item.quantity}</span>
        <strong>${money(item.price * item.quantity)}</strong>
        <button type="button" onclick="removeFromCart('${String(item.id).replace(/'/g, "")}')">حذف</button>
      </div>
    `).join("") +
    `<h3>الإجمالي: ${money(cart.reduce((sum, item) => sum + item.price * item.quantity, 0))}</h3>`
    : "السلة فارغة";
}

window.removeFromCart = function(id) {
  cart = cart.filter(item => String(item.id) !== String(id));
  renderCart();
};

$("orderForm").addEventListener("submit", async event => {
  event.preventDefault();

  if (!cart.length) return notify("أضف منتجات إلى السلة أولًا.");

  const form = new FormData(event.target);
  const customer = Object.fromEntries(form.entries());
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const order = {
    ...customer,
    items: cart.map(item => ({
      product_id: item.id,
      name: item.name,
      price: item.price,
      quantity: item.quantity
    })),
    total
  };

  try {
    await api("/api/orders", {
      method: "POST",
      body: JSON.stringify(order)
    });

    const message = [
      "طلب جديد من متجر MOHAMED FON",
      `الاسم: ${customer.name}`,
      `الهاتف: ${customer.phone}`,
      `المحافظة: ${customer.governorate}`,
      `المنطقة: ${customer.city}`,
      `العنوان: ${customer.address}`,
      "المنتجات:",
      ...cart.map(item => `${item.name} × ${item.quantity} - ${money(item.price * item.quantity)}`),
      `الإجمالي: ${money(total)}`,
      `ملاحظات: ${customer.notes || "لا يوجد"}`
    ].join("\n");

    window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(message)}`, "_blank");
    cart = [];
    renderCart();
    event.target.reset();
    notify("تم تسجيل الطلب. أكمل إرساله عبر واتساب.");
  } catch (error) {
    notify(error.message);
  }
});

$("maintenanceForm").addEventListener("submit", async event => {
  event.preventDefault();

  const form = new FormData(event.target);
  const request = Object.fromEntries(form.entries());

  try {
    await api("/api/maintenance", {
      method: "POST",
      body: JSON.stringify(request)
    });

    const message = [
      "طلب صيانة جديد - MOHAMED FON",
      `الاسم: ${request.name}`,
      `رقم التواصل: ${request.phone}`,
      `نوع الجهاز: ${request.device_type}`,
      `العطل: ${request.issue}`
    ].join("\n");

    window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(message)}`, "_blank");
    event.target.reset();
    notify("تم تسجيل طلب الصيانة. أكمل إرساله عبر واتساب.");
  } catch (error) {
    notify(error.message);
  }
});

$("loginForm").addEventListener("submit", async event => {
  event.preventDefault();

  try {
    const result = await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: $("adminPassword").value })
    });

    adminToken = result.token;
    $("adminPanel").hidden = false;
    notify("تم تسجيل الدخول بنجاح.");
    loadMaintenance();
    loadAdminProducts();
  } catch (error) {
    notify(error.message);
  }
});

$("productForm").addEventListener("submit", async event => {
  event.preventDefault();

  const form = new FormData(event.target);
  const product = Object.fromEntries(form.entries());
  product.price = Number(product.price);

  try {
    await api("/api/admin/products", {
      method: "POST",
      body: JSON.stringify(product)
    });

    event.target.reset();
    notify("تمت إضافة المنتج بنجاح.");
    loadProducts();
    loadAdminProducts();
  } catch (error) {
    notify(error.message);
  }
});

async function loadAdminProducts() {
  let container = $("adminProducts");

  if (!container) {
    container = document.createElement("div");
    container.id = "adminProducts";
    $("adminPanel").appendChild(container);
  }

  try {
    const result = await api("/api/products");
    const products = result.products || [];

    container.innerHTML = "<h3>إدارة المنتجات</h3>" +
      products.map(product => `
        <div class="admin-product">
          <span>${escapeHTML(product.name)} - ${money(product.price)}</span>
          <button type="button" onclick="deleteProduct('${String(product.id).replace(/'/g, "")}')">حذف</button>
        </div>
      `).join("");
  } catch (error) {
    container.textContent = error.message;
  }
}

window.deleteProduct = async function(id) {
  if (!confirm("هل تريد حذف هذا المنتج؟")) return;

  try {
    await api(`/api/admin/products/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
    notify("تم حذف المنتج.");
    loadProducts();
    loadAdminProducts();
  } catch (error) {
    notify(error.message);
  }
};

async function loadMaintenance() {
  const container = $("maintenanceList");

  try {
    const result = await api("/api/admin/maintenance");
    const requests = result.requests || [];

    container.innerHTML = requests.length
      ? requests.map(request => `
        <div class="maintenance-item">
          <p><strong>${escapeHTML(request.name)}</strong></p>
          <p>${escapeHTML(request.phone)} - ${escapeHTML(request.device_type)}</p>
          <p>${escapeHTML(request.issue)}</p>
          <select onchange="updateMaintenance('${String(request.id).replace(/'/g, "")}', this.value)">
            ${["جديد", "قيد الفحص", "جاري الإصلاح", "تم الإصلاح", "تم التسليم"]
              .map(status => `<option ${request.status === status ? "selected" : ""}>${status}</option>`)
              .join("")}
          </select>
        </div>
      `).join("")
      : "لا توجد طلبات صيانة.";
  } catch (error) {
    container.textContent = error.message;
  }
}

window.updateMaintenance = async function(id, status) {
  try {
    await api(`/api/admin/maintenance/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
    notify("تم تحديث حالة الصيانة.");
  } catch (error) {
    notify(error.message);
  }
};

loadProducts();
renderCart();


const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });

const secret = env => env.TOKEN_SECRET || env.ADMIN_PASSWORD;

async function sign(value, key) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(value)
  );

  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function createToken(env) {
  const payload = btoa(JSON.stringify({
    exp: Date.now() + 8 * 60 * 60 * 1000
  })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  return payload + "." + await sign(payload, secret(env));
}

async function authorized(request, env) {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token || !secret(env)) return false;

  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const expected = await sign(parts[0], secret(env));
  if (parts[1] !== expected) return false;

  try {
    const payload = JSON.parse(atob(
      parts[0].replace(/-/g, "+").replace(/_/g, "/")
    ));
    return payload.exp > Date.now();
  } catch {
    return false;
  }
}

async function body(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      if (!env.DB) return json({ error: "قاعدة البيانات غير مربوطة." }, 500);

      if (path === "/api/products" && method === "GET") {
        const result = await env.DB.prepare(
          "SELECT * FROM products ORDER BY created_at DESC"
        ).all();

        return json({ products: result.results || [] });
      }

      if (path === "/api/orders" && method === "POST") {
        const data = await body(request);
        if (!data || !data.name || !data.phone || !Array.isArray(data.items) || !data.items.length) {
          return json({ error: "يرجى إدخال بيانات الطلب كاملة." }, 400);
        }

        await env.DB.prepare(`
          INSERT INTO orders
          (name, phone, governorate, city, address, notes, items, total, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).bind(
          data.name, data.phone, data.governorate || "",
          data.city || "", data.address || "", data.notes || "",
          JSON.stringify(data.items), Number(data.total || 0)
        ).run();

        return json({ success: true, message: "تم حفظ الطلب." }, 201);
      }

      if (path === "/api/maintenance" && method === "POST") {
        const data = await body(request);
        if (!data || !data.name || !data.phone || !data.device_type || !data.issue) {
          return json({ error: "يرجى استكمال بيانات طلب الصيانة." }, 400);
        }

        await env.DB.prepare(`
          INSERT INTO maintenance
          (name, phone, device_type, issue, status, created_at)
          VALUES (?, ?, ?, ?, 'جديد', datetime('now'))
        `).bind(
          data.name, data.phone, data.device_type, data.issue
        ).run();

        return json({ success: true, message: "تم حفظ طلب الصيانة." }, 201);
      }

      if (path === "/api/admin/login" && method === "POST") {
        const data = await body(request);

        if (!env.ADMIN_PASSWORD || !data ||
            data.password !== env.ADMIN_PASSWORD) {
          return json({ error: "كلمة المرور غير صحيحة." }, 401);
        }

        return json({ token: await createToken(env) });
      }

      if (path.startsWith("/api/admin/")) {
        if (!await authorized(request, env)) {
          return json({ error: "يجب تسجيل الدخول أولًا." }, 401);
        }

        if (path === "/api/admin/products" && method === "POST") {
          const data = await body(request);
          if (!data || !data.name || data.price === undefined) {
            return json({ error: "اسم المنتج والسعر مطلوبان." }, 400);
          }

          const id = crypto.randomUUID();

          await env.DB.prepare(`
            INSERT INTO products
            (id, name, price, category, image_url, description, created_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
          `).bind(
            id, data.name, Number(data.price),
            data.category || "", data.image_url || "",
            data.description || ""
          ).run();

          return json({ success: true, id }, 201);
        }

        if (path.startsWith("/api/admin/products/") && method === "DELETE") {
          const id = decodeURIComponent(path.split("/").pop());

          await env.DB.prepare(
            "DELETE FROM products WHERE id = ?"
          ).bind(id).run();

          return json({ success: true });
        }

        if (path === "/api/admin/maintenance" && method === "GET") {
          const result = await env.DB.prepare(
            "SELECT * FROM maintenance ORDER BY created_at DESC"
          ).all();

          return json({ requests: result.results || [] });
        }

        if (path.startsWith("/api/admin/maintenance/") && method === "PATCH") {
          const id = decodeURIComponent(path.split("/").pop());
          const data = await body(request);
          const allowed = [
            "جديد", "قيد الفحص", "جاري الإصلاح",
            "تم الإصلاح", "تم التسليم"
          ];

          if (!data || !allowed.includes(data.status)) {
            return json({ error: "حالة الصيانة غير صحيحة." }, 400);
          }

          await env.DB.prepare(
            "UPDATE maintenance SET status = ? WHERE id = ?"
          ).bind(data.status, id).run();

          return json({ success: true });
        }
      }

      return json({ error: "الصفحة المطلوبة غير موجودة." }, 404);

    } catch (error) {
      return json({ error: "حدث خطأ في الخادم." }, 500);
    }
  }
};

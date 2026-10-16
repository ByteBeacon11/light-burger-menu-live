module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = req.body || {};
  const publishToken = process.env.MENU_PUBLISH_TOKEN;
  if (publishToken && req.headers["x-publish-token"] !== publishToken) {
    res.status(401).json({ error: "Unauthorized publish token" });
    return;
  }

  if (!Array.isArray(body.menu)) {
    res.status(400).json({ error: "menu must be an array" });
    return;
  }

  const owner = process.env.MENU_GITHUB_OWNER || "ByteBeacon11";
  const repo = process.env.MENU_GITHUB_REPO || "light-burger-menu-live";
  const branch = process.env.MENU_GITHUB_BRANCH || "main";
  const githubToken = process.env.MENU_GITHUB_TOKEN;
  if (!githubToken) {
    res.status(500).json({ error: "Missing MENU_GITHUB_TOKEN environment variable" });
    return;
  }

  const filePath = "data/menu.json";
  const payload = JSON.stringify(
    {
      menu: body.menu,
      backgrounds: body.backgrounds || {},
      categories: body.categories || null,
      specials: body.specials || null,
      sides: body.sides || null,
      updated: new Date().toISOString(),
    },
    null,
    2
  );
  const contentBase64 = Buffer.from(payload).toString("base64");

  let sha = null;
  try {
    const getRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`,
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "light-burger-menu-autosave",
        },
      }
    );
    if (getRes.ok) {
      const existing = await getRes.json();
      sha = existing.sha;
    }
  } catch (err) {
    console.warn("Could not fetch existing file:", err);
  }

  const commitBody = {
    message: `Update menu from dashboard at ${new Date().toISOString()}`,
    content: contentBase64,
    branch,
  };
  if (sha) commitBody.sha = sha;

  const putRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "light-burger-menu-autosave",
      },
      body: JSON.stringify(commitBody),
    }
  );

  if (!putRes.ok) {
    const text = await putRes.text();
    console.error("GitHub commit failed:", text);
    res.status(500).json({ error: "GitHub commit failed", detail: text.slice(0, 300) });
    return;
  }

  const result = await putRes.json();
  res.status(200).json({ ok: true, commit: result.commit && result.commit.sha, file: filePath });
};
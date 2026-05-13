/**
 * 外部サイト用トークンゲート。
 * 1) ?token= がある場合は検証後に URL から除去
 * 2) sessionStorage に保存済みなら consume:false で再検証（アドレスバーは常に「普通のURL」）
 * 3) window.opener がある場合は任務ポータルへ postMessage でトークン要求（掲示板URLに token を載せない）
 *
 * TOKEN_GATE_ORIGIN を本番ポータルに合わせてください。
 * 各ページの <head> で window.__TOKEN_RESOURCE_KEY__ を設定してください。
 */
;(function () {
  var TOKEN_GATE_ORIGIN = "https://nazo-portal.vercel.app"
  var STORAGE_KEY = "__ns_ext_token_v1"
  var MSG_REQUEST = "NS_TOKEN_REQUEST"
  var MSG_GRANT = "NS_TOKEN_GRANT"

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
  }

  function showDenied(msg) {
    var m = document.createElement("div")
    m.setAttribute(
      "style",
      "position:fixed;inset:0;z-index:999999;background:#0a0a0c;color:#e8e8ec;display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,sans-serif;text-align:center;"
    )
    m.innerHTML = "<div><p style=\"font-size:14px;opacity:.85\">" + escapeHtml(msg) + "</p></div>"
    document.documentElement.appendChild(m)
  }

  function cleanUrlToken() {
    try {
      var u = new URL(window.location.href)
      if (u.searchParams.has("token")) {
        u.searchParams.delete("token")
        window.history.replaceState({}, "", u.pathname + u.search + u.hash)
      }
    } catch (e) {}
  }

  function validate(token, consume) {
    var resourceKey = window.__TOKEN_RESOURCE_KEY__ || ""
    fetch(TOKEN_GATE_ORIGIN + "/api/platform/validate-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token, resourceKey: resourceKey, consume: consume }),
    })
      .then(function (r) {
        return r.json()
      })
      .then(function (data) {
        if (data && data.valid === true) {
          cleanUrlToken()
          try {
            sessionStorage.setItem(STORAGE_KEY, token)
          } catch (e) {}
          document.documentElement.classList.add("token-gate-ok")
          return
        }
        try {
          sessionStorage.removeItem(STORAGE_KEY)
        } catch (e) {}
        showDenied((data && data.message) || "アクセス権限がありません。")
      })
      .catch(function () {
        try {
          sessionStorage.removeItem(STORAGE_KEY)
        } catch (e) {}
        showDenied("検証サーバーに接続できませんでした。")
      })
  }

  var params = new URLSearchParams(window.location.search)
  var fromQuery = params.get("token")
  if (fromQuery) {
    validate(fromQuery, true)
    return
  }

  try {
    var cached = sessionStorage.getItem(STORAGE_KEY)
    if (cached) {
      validate(cached, false)
      return
    }
  } catch (e) {}

  if (window.opener && !window.opener.closed) {
    var finished = false
    var tries = 0
    var poll = setInterval(function () {
      if (finished) return
      tries++
      if (tries > 60) {
        clearInterval(poll)
        showDenied("ポータルからの認証がタイムアウトしました。任務ポータルのリンクから開き直してください。")
        return
      }
      try {
        window.opener.postMessage(
          { type: MSG_REQUEST, resourceKey: window.__TOKEN_RESOURCE_KEY__ || "" },
          TOKEN_GATE_ORIGIN
        )
      } catch (e) {}
    }, 300)

    function onGrant(ev) {
      if (ev.origin !== TOKEN_GATE_ORIGIN) return
      if (!ev.data || ev.data.type !== MSG_GRANT) return
      var t = ev.data.token
      if (!t) return
      finished = true
      clearInterval(poll)
      window.removeEventListener("message", onGrant)
      validate(t, true)
    }
    window.addEventListener("message", onGrant)
    return
  }

  showDenied("アクセス用のトークンがありません。任務ポータルから調査リンクを開いてください。")
})()

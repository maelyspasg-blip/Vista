// Page de destination après clic sur le lien de confirmation email envoyé
// par Supabase Auth (inscription normale et conversion invité -> vrai compte,
// cf. app/onboarding/inscription.tsx). Supabase vérifie et confirme le
// compte côté serveur AVANT de rediriger ici — cette page n'a donc qu'un
// rôle d'affichage, pas de logique de confirmation à elle-même.
//
// Tente d'ouvrir l'app via le schéma vista:// (fonctionne dès que le build
// natif — dev client ou production — est installé sur l'appareil), avec un
// message clair + bouton de secours si la redirection automatique échoue
// (navigateur desktop, app pas installée sur cet appareil, etc.).
const HTML = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Vista — Compte confirmé</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #F1EFF7;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #2D3A4A;
    padding: 24px;
    box-sizing: border-box;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #0D1B2A; color: #C4C9E8; }
    .carte { background: #243041 !important; box-shadow: none !important; }
  }
  .carte {
    max-width: 380px;
    width: 100%;
    background: #FFFFFF;
    border-radius: 20px;
    padding: 32px 28px;
    text-align: center;
    box-shadow: 0 8px 30px rgba(0,0,0,0.08);
  }
  .coche {
    width: 56px;
    height: 56px;
    border-radius: 28px;
    background: #E4F5E8;
    color: #3FAE58;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 20px;
    font-size: 28px;
  }
  h1 { font-size: 20px; margin: 0 0 10px; }
  p { font-size: 15px; line-height: 1.5; margin: 0 0 24px; opacity: 0.8; }
  .bouton {
    display: inline-block;
    background: #8B6FE8;
    color: #FFFFFF;
    text-decoration: none;
    font-weight: 600;
    font-size: 15px;
    padding: 14px 28px;
    border-radius: 14px;
  }
</style>
</head>
<body>
  <div class="carte">
    <div class="coche">&#10003;</div>
    <h1>Ton compte est confirmé !</h1>
    <p>Tu peux retourner sur l&apos;app Vista pour continuer.</p>
    <a class="bouton" href="vista://onboarding/connexion" id="ouvrir">Ouvrir Vista</a>
  </div>
  <script>
    // Filet de sécurité : si rien ne se passe (app pas installée, ou
    // navigateur qui bloque les redirections de schéma personnalisé), le
    // bouton ci-dessus reste cliquable — le message reste visible dans tous
    // les cas, jamais d'erreur brute affichée.
    setTimeout(function () {
      window.location.href = "vista://onboarding/connexion";
    }, 300);
  </script>
</body>
</html>`;

Deno.serve(() => {
  return new Response(HTML, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
});

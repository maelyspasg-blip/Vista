export function messageErreurAuth(message: string): string {
  const m = message.toLowerCase();

  if (m.includes("already registered") || m.includes("already exists")) {
    return "Un compte existe déjà avec cet email.";
  }
  if (
    m.includes("password should be at least") ||
    m.includes("password is too short") ||
    m.includes("password should contain")
  ) {
    return "Le mot de passe est trop court.";
  }
  if (m.includes("invalid login credentials")) {
    return "Email ou mot de passe incorrect.";
  }
  if (m.includes("anonymous sign-ins are disabled")) {
    return "Le mode essai n'est pas disponible pour le moment.";
  }
  if (m.includes("email not confirmed")) {
    return "Confirme ton adresse email avant de te connecter (vérifie ta boîte mail).";
  }
  if (m.includes("invalid") && m.includes("email")) {
    return "Adresse email invalide.";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Trop de tentatives. Réessaie dans quelques minutes.";
  }
  if (m.includes("network") || m.includes("fetch")) {
    return "Problème de connexion. Vérifie ta connexion internet.";
  }
  return "Une erreur est survenue. Réessaie.";
}

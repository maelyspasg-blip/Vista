import { Picker } from "@react-native-picker/picker";
import { Ionicons } from "@expo/vector-icons";
import { File, Paths } from "expo-file-system";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  TouchableOpacity,
  View,
} from "react-native";
import * as XLSX from "xlsx";
import { captureRef } from "react-native-view-shot";
import { supabase } from "../supabaseClient";
import { Text } from "./Texte";
import { TextInput } from "./TexteInput";
import {
  DonneesExport,
  genererClasseurExport,
  MOIS_LABELS,
  nomFichierExport,
  PeriodeExport,
} from "../utils/exportExcel";
import { calculerResumeVisuel, libellePeriode } from "../utils/rapportVisuel";
import { calculerScoreSante, ScoreSante } from "../utils/score";
import { getInitiales } from "../utils/initiales";
import { CALCULS_DOC } from "../utils/calculsDoc";
import {
  CONDITIONS_GENERALES_UTILISATION,
  POLITIQUE_CONFIDENTIALITE,
} from "../utils/documentsLegaux";
import { ModaleDocumentLegal } from "./ModaleDocumentLegal";
import { messageErreurAuth } from "./authErrors";
import { demanderPermissionNotifications } from "./notifications";
import { AccordionItem } from "./AccordionItem";
import { RapportVisuelCarte } from "./RapportVisuelCarte";
import { BoutonPrincipal } from "./BoutonPrincipal";
import { GuestBanner } from "./GuestBanner";
import { useGuest } from "./GuestContext";
import { SyncErrorBanner } from "./SyncErrorBanner";
import { TailleTexte, useAccessibilite } from "./AccessibiliteContext";
import { useObjectifs } from "./store";
import { Theme, useTheme } from "./ThemeContext";
import { useTutoriel } from "./TutorielContext";

const OPTIONS_TAILLE_TEXTE: { valeur: TailleTexte; label: string }[] = [
  { valeur: "petit", label: "Petit" },
  { valeur: "normal", label: "Normal" },
  { valeur: "grand", label: "Grand" },
  { valeur: "tres_grand", label: "Très grand" },
];

type OptionMoisExport = {
  valeur: string;
  label: string;
  mois: number;
  annee: number;
};

function construireOptionsMoisExport(
  historiquesMois: { mois: number; annee: number }[],
): OptionMoisExport[] {
  const maintenant = new Date();
  const moisActuel = maintenant.getMonth();
  const anneeActuelle = maintenant.getFullYear();

  let debut = { mois: moisActuel, annee: anneeActuelle };
  historiquesMois.forEach((s) => {
    if (
      s.annee < debut.annee ||
      (s.annee === debut.annee && s.mois < debut.mois)
    ) {
      debut = { mois: s.mois, annee: s.annee };
    }
  });

  const options: OptionMoisExport[] = [];
  let m = debut.mois;
  let a = debut.annee;
  while (a < anneeActuelle || (a === anneeActuelle && m <= moisActuel)) {
    options.push({
      valeur: `${a}-${String(m + 1).padStart(2, "0")}`,
      label: `${MOIS_LABELS[m]} ${a}`,
      mois: m,
      annee: a,
    });
    m++;
    if (m > 11) {
      m = 0;
      a++;
    }
  }
  return options;
}

function styleCarte(
  theme: Theme,
  couleurLiseret: string,
  contrasteRenforce: boolean,
) {
  return theme === "sombre"
    ? { borderLeftWidth: contrasteRenforce ? 4 : 3, borderLeftColor: couleurLiseret }
    : {
        backgroundColor: "#FFFFFF",
        borderWidth: contrasteRenforce ? 1.5 : 0.5,
        borderColor: contrasteRenforce ? "#B8B8C0" : "#E4E6EA",
        borderLeftWidth: contrasteRenforce ? 4 : 3,
        borderLeftColor: couleurLiseret,
      };
}

export default function Profil() {
  const router = useRouter();
  const { theme, couleurs: C, toggleTheme } = useTheme();
  const { reinitialiser: reinitialiserTutoriel } = useTutoriel();
  const {
    tailleTexte,
    contrasteRenforce,
    reduireAnimations,
    setTailleTexte,
    setContrasteRenforce,
    setReduireAnimations,
  } = useAccessibilite();
  const objStore = useObjectifs();
  const { isGuest } = useGuest();

  const [email, setEmail] = useState("");
  const [prenomTemp, setPrenomTemp] = useState(objStore.prenom);
  const [nomTemp, setNomTemp] = useState(objStore.nom);
  const [televersementEnCours, setTeleversementEnCours] = useState(false);

  useEffect(() => {
    setPrenomTemp(objStore.prenom);
  }, [objStore.prenom]);

  useEffect(() => {
    setNomTemp(objStore.nom);
  }, [objStore.nom]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? "");
    });
  }, []);

  const enregistrerPrenom = () => {
    const valeur = prenomTemp.trim();
    if (!valeur || valeur === objStore.prenom) return;
    objStore.modifierPrenom(valeur);
  };

  const enregistrerNom = () => {
    const valeur = nomTemp.trim();
    if (valeur === objStore.nom) return;
    objStore.modifierNom(valeur);
  };

  const changerPhotoProfil = async () => {
    if (televersementEnCours) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Photos refusées",
        "Autorise l'accès à tes photos dans les réglages de ton téléphone pour changer ta photo de profil.",
      );
      return;
    }

    const resultat = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (resultat.canceled || !resultat.assets[0]) return;

    const image = resultat.assets[0];
    setTeleversementEnCours(true);
    const succes = await objStore.televerserAvatar(
      image.uri,
      image.mimeType,
    );
    setTeleversementEnCours(false);

    if (!succes) {
      Alert.alert(
        "Erreur",
        "Impossible d'envoyer la photo pour le moment. Réessaie plus tard.",
      );
    }
  };

  const [modalExportVisible, setModalExportVisible] = useState(false);
  const [exportEnCours, setExportEnCours] = useState(false);
  const optionsMoisExport = construireOptionsMoisExport(
    objStore.historiquesMois,
  );
  const [moisDebutExport, setMoisDebutExport] = useState(
    () =>
      optionsMoisExport[Math.max(0, optionsMoisExport.length - 6)]?.valeur ??
      optionsMoisExport[0]?.valeur,
  );
  const [moisFinExport, setMoisFinExport] = useState(
    () => optionsMoisExport[optionsMoisExport.length - 1]?.valeur,
  );

  const genererEtPartagerExport = async () => {
    if (exportEnCours) return;
    const optionDebut = optionsMoisExport.find(
      (o) => o.valeur === moisDebutExport,
    );
    const optionFin = optionsMoisExport.find(
      (o) => o.valeur === moisFinExport,
    );
    if (!optionDebut || !optionFin) return;
    if (moisDebutExport > moisFinExport) {
      Alert.alert(
        "Période invalide",
        "Le mois de début doit être avant (ou égal à) le mois de fin.",
      );
      return;
    }

    const periode: PeriodeExport = {
      moisDebut: optionDebut.mois,
      anneeDebut: optionDebut.annee,
      moisFin: optionFin.mois,
      anneeFin: optionFin.annee,
    };
    const donnees: DonneesExport = {
      enveloppes: objStore.enveloppes,
      transactions: objStore.transactions,
      historiquesMois: objStore.historiquesMois,
      epargneMois: objStore.epargneMois,
    };

    setExportEnCours(true);
    try {
      const classeur = genererClasseurExport(donnees, periode);
      const sortie = XLSX.write(classeur, {
        bookType: "xlsx",
        type: "array",
      });
      const octets =
        sortie instanceof Uint8Array ? sortie : new Uint8Array(sortie);

      const fichier = new File(Paths.cache, nomFichierExport(periode));
      fichier.create({ overwrite: true });
      fichier.write(octets);

      const partageDisponible = await Sharing.isAvailableAsync();
      if (!partageDisponible) {
        Alert.alert(
          "Erreur",
          "Le partage de fichiers n'est pas disponible sur cet appareil.",
        );
        return;
      }

      await Sharing.shareAsync(fichier.uri, {
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        UTI: "com.microsoft.excel.xlsx",
        dialogTitle: "Exporter les données Vista",
      });
      setModalExportVisible(false);
    } catch (e) {
      console.error("Export Excel a échoué :", e);
      Alert.alert(
        "Erreur",
        "Impossible de générer le fichier d'export pour le moment.",
      );
    } finally {
      setExportEnCours(false);
    }
  };

  const [modalRapportVisible, setModalRapportVisible] = useState(false);
  const [partageRapportEnCours, setPartageRapportEnCours] = useState(false);
  const [moisDebutRapport, setMoisDebutRapport] = useState(
    () =>
      optionsMoisExport[Math.max(0, optionsMoisExport.length - 6)]?.valeur ??
      optionsMoisExport[0]?.valeur,
  );
  const [moisFinRapport, setMoisFinRapport] = useState(
    () => optionsMoisExport[optionsMoisExport.length - 1]?.valeur,
  );
  const rapportCarteRef = useRef<View>(null);

  const optionDebutRapport = optionsMoisExport.find(
    (o) => o.valeur === moisDebutRapport,
  );
  const optionFinRapport = optionsMoisExport.find(
    (o) => o.valeur === moisFinRapport,
  );
  const periodeRapport: PeriodeExport | null =
    optionDebutRapport && optionFinRapport && moisDebutRapport <= moisFinRapport
      ? {
          moisDebut: optionDebutRapport.mois,
          anneeDebut: optionDebutRapport.annee,
          moisFin: optionFinRapport.mois,
          anneeFin: optionFinRapport.annee,
        }
      : null;
  const donneesRapport: DonneesExport = {
    enveloppes: objStore.enveloppes,
    transactions: objStore.transactions,
    historiquesMois: objStore.historiquesMois,
    epargneMois: objStore.epargneMois,
  };
  const resumeRapport = periodeRapport
    ? calculerResumeVisuel(donneesRapport, periodeRapport)
    : null;
  const scoreRapport: ScoreSante | null =
    resumeRapport?.periodeInclutMoisActuel
      ? calculerScoreSante({
          enveloppes: objStore.enveloppes,
          epargneMois: objStore.epargneMois,
          historiquesMois: objStore.historiquesMois,
          seuilEpargneConstante: objStore.seuilEpargneConstante,
          objectifs: objStore.objectifs,
        })
      : null;

  const partagerResumeVisuel = async () => {
    if (partageRapportEnCours || !rapportCarteRef.current) return;
    setPartageRapportEnCours(true);
    try {
      const uri = await captureRef(rapportCarteRef, {
        format: "png",
        quality: 1,
        result: "tmpfile",
      });
      const uriPartage = uri.startsWith("file://") ? uri : `file://${uri}`;

      const partageDisponible = await Sharing.isAvailableAsync();
      if (!partageDisponible) {
        Alert.alert(
          "Erreur",
          "Le partage de fichiers n'est pas disponible sur cet appareil.",
        );
        return;
      }

      await Sharing.shareAsync(uriPartage, {
        mimeType: "image/png",
        dialogTitle: "Partager le résumé Vista",
      });
      setModalRapportVisible(false);
    } catch (e) {
      console.error("Génération du résumé visuel a échoué :", e);
      Alert.alert(
        "Erreur",
        "Impossible de générer le résumé visuel pour le moment.",
      );
    } finally {
      setPartageRapportEnCours(false);
    }
  };

  const [modalCalculsVisible, setModalCalculsVisible] = useState(false);
  const [pageCalculsActive, setPageCalculsActive] = useState(
    CALCULS_DOC[0].page,
  );

  const [documentLegalOuvert, setDocumentLegalOuvert] = useState<
    "confidentialite" | "cgu" | null
  >(null);

  const [modalMotDePasseVisible, setModalMotDePasseVisible] = useState(false);
  const [nouveauMotDePasse, setNouveauMotDePasse] = useState("");
  const [confirmationMotDePasse, setConfirmationMotDePasse] = useState("");
  const [erreurMotDePasse, setErreurMotDePasse] = useState("");
  const [chargementMotDePasse, setChargementMotDePasse] = useState(false);
  const [succesMotDePasse, setSuccesMotDePasse] = useState(false);

  const fermerModalMotDePasse = () => {
    setModalMotDePasseVisible(false);
    setNouveauMotDePasse("");
    setConfirmationMotDePasse("");
    setErreurMotDePasse("");
    setSuccesMotDePasse(false);
  };

  const changerMotDePasse = async () => {
    if (chargementMotDePasse) return;
    setErreurMotDePasse("");

    if (nouveauMotDePasse.length < 6) {
      setErreurMotDePasse("Le mot de passe doit faire au moins 6 caractères.");
      return;
    }
    if (nouveauMotDePasse !== confirmationMotDePasse) {
      setErreurMotDePasse("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setChargementMotDePasse(true);
    const { error } = await supabase.auth.updateUser({
      password: nouveauMotDePasse,
    });
    setChargementMotDePasse(false);

    if (error) {
      setErreurMotDePasse(messageErreurAuth(error.message));
      return;
    }

    setSuccesMotDePasse(true);
    setTimeout(fermerModalMotDePasse, 1400);
  };

  const fermerModalMotDePasseAvecSauvegarde = () => {
    changerMotDePasse();
    fermerModalMotDePasse();
  };

  const toggleNotifications = async (valeur: boolean) => {
    if (!valeur) {
      objStore.modifierNotificationsActives(false);
      return;
    }
    const autorise = await demanderPermissionNotifications();
    objStore.modifierNotificationsActives(autorise);
    if (!autorise) {
      Alert.alert(
        "Notifications refusées",
        "Autorise les notifications dans les réglages de ton téléphone pour les activer.",
      );
    }
  };

  const confirmerDeconnexion = async () => {
    await supabase.auth.signOut();
    router.replace("/onboarding/connexion");
  };

  const seDeconnecter = () => {
    if (!isGuest) {
      confirmerDeconnexion();
      return;
    }
    Alert.alert(
      "Te déconnecter ?",
      "Si tu te déconnectes, tu perdras l'accès à ton compte d'essai et tes données de démo.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Se déconnecter quand même",
          style: "destructive",
          onPress: confirmerDeconnexion,
        },
      ],
    );
  };

  const [suppressionEnCours, setSuppressionEnCours] = useState(false);

  const confirmerSuppressionCompte = async () => {
    if (suppressionEnCours) return;
    setSuppressionEnCours(true);

    try {
      // TEMPORAIRE — diagnostic "impossible de supprimer" : log le résultat
      // complet de l'appel (data/error/status), et le corps de la réponse
      // d'erreur si disponible (error.context est le Response brut pour un
      // FunctionsHttpError — c'est là que se trouve le message JSON
      // {error: "..."} réellement renvoyé par la fonction). À retirer une
      // fois le vrai message d'erreur identifié.
      const resultat = await supabase.functions.invoke("delete-account");
      const { data, error } = resultat;
      console.log("[delete-account] résultat complet :", {
        data,
        error,
        status: (error as { context?: { status?: number } })?.context?.status,
      });
      if (
        error &&
        (error as { context?: unknown }).context instanceof Response
      ) {
        try {
          const corps = await (
            error as { context: Response }
          ).context.clone().text();
          console.log("[delete-account] corps de la réponse d'erreur :", corps);
        } catch (e) {
          console.log("[delete-account] corps de l'erreur illisible :", e);
        }
      }
      if (error) {
        console.error("Supabase delete-account a échoué :", error);
        Alert.alert(
          "Erreur",
          "Impossible de supprimer le compte pour le moment. Réessaie plus tard.",
        );
        return;
      }
    } catch (e) {
      console.error("Appel à delete-account a échoué :", e);
      Alert.alert(
        "Erreur",
        "Impossible de supprimer le compte pour le moment. Réessaie plus tard.",
      );
      return;
    } finally {
      setSuppressionEnCours(false);
    }

    await supabase.auth.signOut();
    router.replace("/onboarding/connexion");
    Alert.alert(
      "Compte supprimé",
      "Ton compte et toutes tes données ont bien été supprimés.",
    );
  };

  const supprimerCompte = () => {
    Alert.alert(
      "Supprimer ton compte ?",
      "Cette action est définitive : toutes tes données (catégories, objectifs, transactions, historique) seront supprimées et ne pourront pas être récupérées.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: confirmerSuppressionCompte,
        },
      ],
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: C.fondPage }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.7}
          style={[styles.btnRetour, { backgroundColor: C.iconeBoutonFond }]}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <Ionicons name="arrow-back" size={20} color={C.iconeBouton} />
        </TouchableOpacity>
        <Text style={[styles.titre, { color: C.texte }]}>Profil</Text>
        <View style={{ width: 36 }} />
      </View>

      <GuestBanner />
      <SyncErrorBanner />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.sectionLabel, { color: C.texteMuted }]}>
          INFORMATIONS
        </Text>
        <View style={[styles.carte, { backgroundColor: C.carte, borderColor: C.carteBorder }, styleCarte(theme, C.purple, contrasteRenforce)]}>
          <View style={styles.avatarSection}>
            <TouchableOpacity
              style={[styles.avatarPreview, { backgroundColor: C.hero }]}
              onPress={changerPhotoProfil}
              activeOpacity={0.7}
              disabled={televersementEnCours}
              accessibilityRole="button"
              accessibilityLabel="Changer la photo de profil"
            >
              {televersementEnCours ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : objStore.avatarUrl ? (
                <Image
                  source={{ uri: objStore.avatarUrl }}
                  style={styles.avatarPreviewImage}
                  contentFit="cover"
                />
              ) : (
                <Text style={styles.avatarPreviewTexte}>
                  {getInitiales(objStore.prenom, objStore.nom)}
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={changerPhotoProfil} activeOpacity={0.7} disabled={televersementEnCours}>
              <Text style={[styles.avatarChangerTexte, { color: C.purple }]}>
                Changer la photo
              </Text>
            </TouchableOpacity>
            {objStore.isAdmin && (
              <View
                style={[
                  styles.badgeAdmin,
                  { backgroundColor: C.lavandeLight },
                ]}
              >
                <Ionicons
                  name="shield-checkmark-outline"
                  size={12}
                  color={C.texteMuted}
                />
                <Text style={[styles.badgeAdminTexte, { color: C.texteMuted }]}>
                  Administrateur
                </Text>
              </View>
            )}
          </View>

          <Text style={[styles.champLabel, { color: C.texteMuted }]}>
            Prénom
          </Text>
          <TextInput
            style={[
              styles.input,
              { color: C.texte, backgroundColor: C.fondSecondaire },
            ]}
            value={prenomTemp}
            onChangeText={setPrenomTemp}
            onBlur={enregistrerPrenom}
            placeholder="Ton prénom"
            placeholderTextColor={C.texteMuted}
            returnKeyType="done"
          />

          <Text
            style={[styles.champLabel, { color: C.texteMuted, marginTop: 16 }]}
          >
            Nom
          </Text>
          <TextInput
            style={[
              styles.input,
              { color: C.texte, backgroundColor: C.fondSecondaire },
            ]}
            value={nomTemp}
            onChangeText={setNomTemp}
            onBlur={enregistrerNom}
            placeholder="Ton nom"
            placeholderTextColor={C.texteMuted}
            returnKeyType="done"
          />

          <Text
            style={[styles.champLabel, { color: C.texteMuted, marginTop: 16 }]}
          >
            Email
          </Text>
          <Text style={[styles.champValeurStatique, { color: C.texte }]}>
            {email || "…"}
          </Text>

          <TouchableOpacity
            style={[
              styles.btnSecondaire,
              { borderColor: C.separateur, marginTop: 18 },
            ]}
            onPress={() => setModalMotDePasseVisible(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="lock-closed-outline" size={16} color={C.texte} />
            <Text style={[styles.btnSecondaireTexte, { color: C.texte }]}>
              Changer de mot de passe
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionLabel, { color: C.texteMuted }]}>
          PARAMÈTRES DE L'APP
        </Text>
        <View style={[styles.carte, { backgroundColor: C.carte, borderColor: C.carteBorder }, styleCarte(theme, C.bleuGris, contrasteRenforce)]}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.switchLabel, { color: C.texte }]}>
                Mode sombre
              </Text>
              <Text style={[styles.switchSub, { color: C.texteMuted }]}>
                Bascule entre thème clair et sombre
              </Text>
            </View>
            <Switch
              value={theme === "sombre"}
              onValueChange={toggleTheme}
              trackColor={{ false: C.separateur, true: C.purpleLight }}
              thumbColor={theme === "sombre" ? C.purple : "#FFF"}
              accessibilityLabel="Mode sombre"
            />
          </View>

          <View style={[styles.switchRow, { marginTop: 18 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.switchLabel, { color: C.texte }]}>
                Notifications
              </Text>
              <Text style={[styles.switchSub, { color: C.texteMuted }]}>
                Rappels des événements du Planning
              </Text>
            </View>
            <Switch
              value={objStore.notificationsActives}
              onValueChange={toggleNotifications}
              trackColor={{ false: C.separateur, true: C.purpleLight }}
              thumbColor={objStore.notificationsActives ? C.purple : "#FFF"}
              accessibilityLabel="Notifications"
            />
          </View>

          <TouchableOpacity
            style={[styles.btnSecondaire, { borderColor: C.separateur, marginTop: 18 }]}
            onPress={() => {
              reinitialiserTutoriel();
              router.replace("/(tabs)");
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="help-circle-outline" size={16} color={C.texte} />
            <Text style={[styles.btnSecondaireTexte, { color: C.texte }]}>
              Revoir le tutoriel
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionLabel, { color: C.texteMuted }]}>
          ACCESSIBILITÉ
        </Text>
        <View style={[styles.carte, { backgroundColor: C.carte, borderColor: C.carteBorder }, styleCarte(theme, C.accent, contrasteRenforce)]}>
          <Text style={[styles.switchLabel, { color: C.texte }]}>
            Taille du texte
          </Text>
          <View style={styles.chipRowTailleTexte}>
            {OPTIONS_TAILLE_TEXTE.map((option) => {
              const actif = tailleTexte === option.valeur;
              return (
                <TouchableOpacity
                  key={option.valeur}
                  style={[
                    styles.chipTailleTexte,
                    {
                      backgroundColor: actif ? C.purple : C.fondSecondaire,
                      borderColor: actif ? C.purple : C.carteBorder,
                    },
                  ]}
                  onPress={() => setTailleTexte(option.valeur)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Taille du texte : ${option.label}`}
                  accessibilityState={{ selected: actif }}
                >
                  <Text
                    style={[
                      styles.chipTailleTexteTexte,
                      { color: actif ? "#FFFFFF" : C.texteMuted },
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={[styles.switchRow, { marginTop: 20 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.switchLabel, { color: C.texte }]}>
                Contraste renforcé
              </Text>
              <Text style={[styles.switchSub, { color: C.texteMuted }]}>
                Textes et bordures plus marqués
              </Text>
            </View>
            <Switch
              value={contrasteRenforce}
              onValueChange={setContrasteRenforce}
              trackColor={{ false: C.separateur, true: C.purpleLight }}
              thumbColor={contrasteRenforce ? C.purple : "#FFF"}
              accessibilityLabel="Contraste renforcé"
            />
          </View>

          <View style={[styles.switchRow, { marginTop: 18 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.switchLabel, { color: C.texte }]}>
                Réduire les animations
              </Text>
              <Text style={[styles.switchSub, { color: C.texteMuted }]}>
                Désactive les transitions et animations
              </Text>
            </View>
            <Switch
              value={reduireAnimations}
              onValueChange={setReduireAnimations}
              trackColor={{ false: C.separateur, true: C.purpleLight }}
              thumbColor={reduireAnimations ? C.purple : "#FFF"}
              accessibilityLabel="Réduire les animations"
            />
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: C.texteMuted }]}>
          DONNÉES
        </Text>
        <View style={[styles.carte, { backgroundColor: C.carte, borderColor: C.carteBorder }, styleCarte(theme, C.vert, contrasteRenforce)]}>
          <TouchableOpacity
            style={[styles.btnSecondaire, { borderColor: C.separateur }]}
            onPress={() => setModalExportVisible(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="download-outline" size={16} color={C.texte} />
            <Text style={[styles.btnSecondaireTexte, { color: C.texte }]}>
              Exporter mes données (Excel)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.btnSecondaire,
              { borderColor: C.separateur, marginTop: 12 },
            ]}
            onPress={() => setModalRapportVisible(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="image-outline" size={16} color={C.texte} />
            <Text style={[styles.btnSecondaireTexte, { color: C.texte }]}>
              Exporter un résumé visuel
            </Text>
          </TouchableOpacity>
        </View>

        {objStore.isAdmin && (
          <>
            <Text style={[styles.sectionLabel, { color: C.texteMuted }]}>
              DÉTAIL DES CALCULS
            </Text>
            <View
              style={[
                styles.carte,
                { backgroundColor: C.carte, borderColor: C.carteBorder },
                styleCarte(theme, C.lavande, contrasteRenforce),
              ]}
            >
              <Text style={[styles.calculsIntro, { color: C.texteMuted }]}>
                Comment chaque chiffre affiché dans l&apos;app est calculé,
                page par page.
              </Text>
              <TouchableOpacity
                style={[styles.btnSecondaire, { borderColor: C.separateur }]}
                onPress={() => setModalCalculsVisible(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="calculator-outline" size={16} color={C.texte} />
                <Text style={[styles.btnSecondaireTexte, { color: C.texte }]}>
                  Voir le détail des calculs
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        <Text style={[styles.sectionLabel, { color: C.texteMuted }]}>
          LÉGAL
        </Text>
        <View style={[styles.carte, { backgroundColor: C.carte, borderColor: C.carteBorder }, styleCarte(theme, C.lavande, contrasteRenforce)]}>
          <TouchableOpacity
            style={[styles.btnSecondaire, { borderColor: C.separateur }]}
            onPress={() => setDocumentLegalOuvert("confidentialite")}
            activeOpacity={0.7}
          >
            <Ionicons
              name="shield-checkmark-outline"
              size={16}
              color={C.texte}
            />
            <Text style={[styles.btnSecondaireTexte, { color: C.texte }]}>
              Politique de confidentialité
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.btnSecondaire,
              { borderColor: C.separateur, marginTop: 12 },
            ]}
            onPress={() => setDocumentLegalOuvert("cgu")}
            activeOpacity={0.7}
          >
            <Ionicons name="document-text-outline" size={16} color={C.texte} />
            <Text style={[styles.btnSecondaireTexte, { color: C.texte }]}>
              Conditions générales d&apos;utilisation
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionLabel, { color: C.texteMuted }]}>
          COMPTE
        </Text>
        <View style={[styles.carte, { backgroundColor: C.carte, borderColor: C.carteBorder }, styleCarte(theme, C.peach, contrasteRenforce)]}>
          <TouchableOpacity
            style={[styles.btnSecondaire, { borderColor: C.separateur }]}
            onPress={seDeconnecter}
            activeOpacity={0.7}
          >
            <Ionicons name="log-out-outline" size={16} color={C.texte} />
            <Text style={[styles.btnSecondaireTexte, { color: C.texte }]}>
              Se déconnecter
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.btnSecondaire,
              { borderColor: C.separateur, marginTop: 12 },
            ]}
            onPress={supprimerCompte}
            activeOpacity={0.7}
            disabled={suppressionEnCours}
          >
            {suppressionEnCours ? (
              <ActivityIndicator color="#E24B4A" />
            ) : (
              <>
                <Ionicons name="trash-outline" size={16} color="#E24B4A" />
                <Text
                  style={[styles.btnSecondaireTexte, { color: "#E24B4A" }]}
                >
                  Supprimer mon compte
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal
        visible={modalMotDePasseVisible}
        animationType={reduireAnimations ? "none" : "slide"}
        transparent
        onRequestClose={fermerModalMotDePasse}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <TouchableOpacity
            style={styles.modalOverlayTouch}
            activeOpacity={1}
            onPress={fermerModalMotDePasseAvecSauvegarde}
          >
            <TouchableOpacity
              style={[styles.modalCard, { backgroundColor: C.carte }]}
              activeOpacity={1}
              onPress={() => {}}
            >
              <Text style={[styles.modalTitre, { color: C.texte }]}>
                Changer de mot de passe
              </Text>

              <Text style={[styles.champLabel, { color: C.texteMuted }]}>
                Nouveau mot de passe
              </Text>
              <TextInput
                style={[
                  styles.input,
                  { color: C.texte, backgroundColor: C.fondSecondaire },
                ]}
                secureTextEntry
                value={nouveauMotDePasse}
                onChangeText={setNouveauMotDePasse}
                placeholder="Au moins 6 caractères"
                placeholderTextColor={C.texteMuted}
                returnKeyType="next"
              />

              <Text
                style={[
                  styles.champLabel,
                  { color: C.texteMuted, marginTop: 14 },
                ]}
              >
                Confirmer le mot de passe
              </Text>
              <TextInput
                style={[
                  styles.input,
                  { color: C.texte, backgroundColor: C.fondSecondaire },
                ]}
                secureTextEntry
                value={confirmationMotDePasse}
                onChangeText={setConfirmationMotDePasse}
                placeholder="Retape le mot de passe"
                placeholderTextColor={C.texteMuted}
                returnKeyType="done"
                onSubmitEditing={changerMotDePasse}
              />

              {!!erreurMotDePasse && (
                <Text style={styles.erreurTexte}>{erreurMotDePasse}</Text>
              )}
              {succesMotDePasse && (
                <Text style={[styles.succesTexte, { color: C.accentText }]}>
                  Mot de passe mis à jour.
                </Text>
              )}

              <BoutonPrincipal
                style={[
                  styles.btnPrincipal,
                  {
                    backgroundColor: C.purple,
                    opacity: chargementMotDePasse ? 0.6 : 1,
                    marginTop: 18,
                  },
                ]}
                onPress={changerMotDePasse}
                disabled={chargementMotDePasse}
              >
                {chargementMotDePasse ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.btnPrincipalTexte}>Enregistrer</Text>
                )}
              </BoutonPrincipal>

              <TouchableOpacity
                style={styles.btnAnnuler}
                onPress={fermerModalMotDePasse}
                activeOpacity={0.7}
              >
                <Text style={[styles.btnAnnulerTexte, { color: C.texteMuted }]}>
                  Annuler
                </Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={modalExportVisible}
        transparent
        animationType={reduireAnimations ? "none" : "slide"}
        onRequestClose={() => setModalExportVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlayTouch}
          activeOpacity={1}
          onPress={() => setModalExportVisible(false)}
        >
          <TouchableOpacity
            style={[styles.modalCard, { backgroundColor: C.carte }]}
            activeOpacity={1}
            onPress={() => {}}
          >
            <Text style={[styles.modalTitre, { color: C.texte }]}>
              Exporter mes données
            </Text>
            <Text style={[styles.exportSousTitre, { color: C.texteMuted }]}>
              Génère un fichier Excel avec le résumé mensuel, le comparatif
              des dépenses et des entrées par catégorie, et le détail des
              transactions du mois en cours.
            </Text>

            <Text
              style={[styles.champLabel, { color: C.texteMuted, marginTop: 8 }]}
            >
              Du
            </Text>
            <Picker
              selectedValue={moisDebutExport}
              onValueChange={(valeur) => setMoisDebutExport(String(valeur))}
              itemStyle={{ color: C.texte }}
            >
              {optionsMoisExport.map((o) => (
                <Picker.Item key={o.valeur} label={o.label} value={o.valeur} />
              ))}
            </Picker>

            <Text
              style={[styles.champLabel, { color: C.texteMuted, marginTop: 8 }]}
            >
              Au
            </Text>
            <Picker
              selectedValue={moisFinExport}
              onValueChange={(valeur) => setMoisFinExport(String(valeur))}
              itemStyle={{ color: C.texte }}
            >
              {optionsMoisExport.map((o) => (
                <Picker.Item key={o.valeur} label={o.label} value={o.valeur} />
              ))}
            </Picker>

            <BoutonPrincipal
              style={[
                styles.btnPrincipal,
                {
                  backgroundColor: C.purple,
                  opacity: exportEnCours ? 0.6 : 1,
                  marginTop: 18,
                },
              ]}
              onPress={genererEtPartagerExport}
              disabled={exportEnCours}
            >
              {exportEnCours ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.btnPrincipalTexte}>
                  Générer et partager
                </Text>
              )}
            </BoutonPrincipal>

            <TouchableOpacity
              style={styles.btnAnnuler}
              onPress={() => setModalExportVisible(false)}
              activeOpacity={0.7}
              disabled={exportEnCours}
            >
              <Text style={[styles.btnAnnulerTexte, { color: C.texteMuted }]}>
                Annuler
              </Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={modalRapportVisible}
        transparent
        animationType={reduireAnimations ? "none" : "slide"}
        onRequestClose={() => setModalRapportVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlayTouch}
          activeOpacity={1}
          onPress={() => setModalRapportVisible(false)}
        >
          <TouchableOpacity
            style={[styles.modalCardCalculs, { backgroundColor: C.carte }]}
            activeOpacity={1}
            onPress={() => {}}
          >
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              <Text style={[styles.modalTitre, { color: C.texte }]}>
                Exporter un résumé visuel
              </Text>
              <Text style={[styles.exportSousTitre, { color: C.texteMuted }]}>
                Une image unique et lisible d&apos;un coup d&apos;œil, à
                partager facilement — pas un fichier à analyser.
              </Text>

              <Text
                style={[styles.champLabel, { color: C.texteMuted, marginTop: 8 }]}
              >
                Du
              </Text>
              <Picker
                selectedValue={moisDebutRapport}
                onValueChange={(valeur) => setMoisDebutRapport(String(valeur))}
                itemStyle={{ color: C.texte }}
              >
                {optionsMoisExport.map((o) => (
                  <Picker.Item key={o.valeur} label={o.label} value={o.valeur} />
                ))}
              </Picker>

              <Text
                style={[styles.champLabel, { color: C.texteMuted, marginTop: 8 }]}
              >
                Au
              </Text>
              <Picker
                selectedValue={moisFinRapport}
                onValueChange={(valeur) => setMoisFinRapport(String(valeur))}
                itemStyle={{ color: C.texte }}
              >
                {optionsMoisExport.map((o) => (
                  <Picker.Item key={o.valeur} label={o.label} value={o.valeur} />
                ))}
              </Picker>

              {periodeRapport && resumeRapport ? (
                <View style={styles.apercuRapport}>
                  <RapportVisuelCarte
                    ref={rapportCarteRef}
                    periodeLabel={libellePeriode(periodeRapport)}
                    resume={resumeRapport}
                    score={scoreRapport}
                  />
                </View>
              ) : (
                <Text
                  style={[
                    styles.champLabel,
                    { color: C.texteMuted, marginTop: 18, fontWeight: "400" },
                  ]}
                >
                  Le mois de début doit être avant (ou égal à) le mois de fin.
                </Text>
              )}

              <BoutonPrincipal
                style={[
                  styles.btnPrincipal,
                  {
                    backgroundColor: C.purple,
                    opacity: partageRapportEnCours || !periodeRapport ? 0.6 : 1,
                    marginTop: 18,
                  },
                ]}
                onPress={partagerResumeVisuel}
                disabled={partageRapportEnCours || !periodeRapport}
              >
                {partageRapportEnCours ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.btnPrincipalTexte}>Partager</Text>
                )}
              </BoutonPrincipal>

              <TouchableOpacity
                style={styles.btnAnnuler}
                onPress={() => setModalRapportVisible(false)}
                activeOpacity={0.7}
                disabled={partageRapportEnCours}
              >
                <Text style={[styles.btnAnnulerTexte, { color: C.texteMuted }]}>
                  Annuler
                </Text>
              </TouchableOpacity>
              <View style={{ height: 20 }} />
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={modalCalculsVisible}
        transparent
        animationType={reduireAnimations ? "none" : "slide"}
        onRequestClose={() => setModalCalculsVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlayTouch}
          activeOpacity={1}
          onPress={() => setModalCalculsVisible(false)}
        >
          <TouchableOpacity
            style={[styles.modalCardCalculs, { backgroundColor: C.carte }]}
            activeOpacity={1}
            onPress={() => {}}
          >
            <View style={styles.modalHeaderCalculs}>
              <View style={styles.modalHeaderCalculsTitreBloc}>
                <Text style={[styles.modalTitre, { color: C.texte, marginBottom: 2 }]}>
                  Détail des calculs
                </Text>
                <Text style={[styles.exportSousTitre, { color: C.texteMuted, marginBottom: 0 }]}>
                  Comment chaque chiffre est calculé
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setModalCalculsVisible(false)}
                activeOpacity={0.6}
                style={styles.modalTermineBouton}
              >
                <Text style={[styles.modalTermine, { color: C.purple }]}>
                  Terminé
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.chipRowCalculs}>
              {CALCULS_DOC.map((groupe) => (
                <TouchableOpacity
                  key={groupe.page}
                  style={[
                    styles.chipCalculs,
                    {
                      backgroundColor: C.fondSecondaire,
                      borderColor: C.carteBorder,
                    },
                    pageCalculsActive === groupe.page && {
                      backgroundColor: C.purple,
                      borderColor: C.purple,
                    },
                  ]}
                  onPress={() => setPageCalculsActive(groupe.page)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.chipCalculsTexte,
                      { color: C.texteMuted },
                      pageCalculsActive === groupe.page && { color: "#FFFFFF" },
                    ]}
                  >
                    {groupe.page}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {CALCULS_DOC.find((g) => g.page === pageCalculsActive)?.entrees.map(
                (entree) => (
                  <AccordionItem
                    key={entree.titre}
                    titre={entree.titre}
                    texte={entree.explication}
                  />
                ),
              )}
              <View style={{ height: 20 }} />
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <ModaleDocumentLegal
        visible={documentLegalOuvert === "confidentialite"}
        onClose={() => setDocumentLegalOuvert(null)}
        titre="Politique de confidentialité"
        texte={POLITIQUE_CONFIDENTIALITE}
      />
      <ModaleDocumentLegal
        visible={documentLegalOuvert === "cgu"}
        onClose={() => setDocumentLegalOuvert(null)}
        titre="Conditions générales d'utilisation"
        texte={CONDITIONS_GENERALES_UTILISATION}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  btnRetour: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  titre: { fontSize: 18, fontWeight: "700" },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 22,
  },
  carte: {
    borderRadius: 18,
    padding: 18,
    borderWidth: 0.5,
  },
  champLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
  },
  avatarSection: {
    alignItems: "center",
    marginBottom: 20,
  },
  avatarPreview: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: 10,
  },
  avatarPreviewImage: {
    width: 76,
    height: 76,
  },
  avatarPreviewTexte: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 26,
  },
  avatarChangerTexte: {
    fontSize: 13,
    fontWeight: "600",
  },
  badgeAdmin: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeAdminTexte: {
    fontSize: 11,
    fontWeight: "600",
  },
  champValeurStatique: {
    fontSize: 15,
    fontWeight: "600",
  },
  input: {
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
  },
  btnSecondaire: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 10,
  },
  btnSecondaireTexte: {
    fontSize: 14,
    fontWeight: "600",
    flexShrink: 1,
    textAlign: "center",
  },
  calculsIntro: { fontSize: 13, lineHeight: 18, marginBottom: 14 },
  modalCardCalculs: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: "85%",
    overflow: "hidden",
  },
  modalHeaderCalculs: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  modalHeaderCalculsTitreBloc: { flex: 1, marginRight: 12 },
  modalTermineBouton: { flexShrink: 0 },
  modalTermine: { fontSize: 16, fontWeight: "600" },
  chipRowCalculs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  apercuRapport: { alignItems: "center", marginTop: 18 },
  chipCalculs: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 0.5,
  },
  chipCalculsTexte: { fontSize: 13, fontWeight: "600" },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  switchLabel: { fontSize: 15, fontWeight: "600" },
  switchSub: { fontSize: 12, marginTop: 2 },
  chipRowTailleTexte: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  chipTailleTexte: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 0.5,
  },
  chipTailleTexteTexte: { fontSize: 13, fontWeight: "600" },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalOverlayTouch: { justifyContent: "flex-end", flex: 1 },
  modalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 36,
  },
  modalTitre: { fontSize: 18, fontWeight: "700", marginBottom: 18 },
  exportSousTitre: { fontSize: 13, lineHeight: 18, marginBottom: 14 },
  erreurTexte: {
    fontSize: 13,
    color: "#E24B4A",
    marginTop: 12,
  },
  succesTexte: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: 12,
  },
  btnPrincipal: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
  },
  btnPrincipalTexte: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
  btnAnnuler: { alignItems: "center", marginTop: 14 },
  btnAnnulerTexte: { fontSize: 14, fontWeight: "600" },
});

import { Picker } from "@react-native-picker/picker";
import { Ionicons } from "@expo/vector-icons";
import { File, Paths } from "expo-file-system";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as XLSX from "xlsx";
import { supabase } from "../supabaseClient";
import {
  DonneesExport,
  genererClasseurExport,
  MOIS_LABELS,
  nomFichierExport,
  PeriodeExport,
} from "../utils/exportExcel";
import { getInitiales } from "../utils/initiales";
import { messageErreurAuth } from "./authErrors";
import { demanderPermissionNotifications } from "./notifications";
import { SyncErrorBanner } from "./SyncErrorBanner";
import { useObjectifs } from "./store";
import { Theme, useTheme } from "./ThemeContext";

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

function styleCarte(theme: Theme, couleurLiseret: string) {
  return theme === "sombre"
    ? { borderLeftWidth: 3, borderLeftColor: couleurLiseret }
    : {
        backgroundColor: "#FFFFFF",
        borderWidth: 0.5,
        borderColor: "#E4E6EA",
        borderLeftWidth: 3,
        borderLeftColor: couleurLiseret,
      };
}

export default function Profil() {
  const router = useRouter();
  const { theme, couleurs: C, toggleTheme } = useTheme();
  const objStore = useObjectifs();

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
      argentDisponible: objStore.argentDisponible,
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

  const seDeconnecter = async () => {
    await supabase.auth.signOut();
    router.replace("/onboarding/connexion");
  };

  const [suppressionEnCours, setSuppressionEnCours] = useState(false);

  const confirmerSuppressionCompte = async () => {
    if (suppressionEnCours) return;
    setSuppressionEnCours(true);
    const { error } = await supabase.functions.invoke("delete-account");
    setSuppressionEnCours(false);

    if (error) {
      Alert.alert(
        "Erreur",
        "Impossible de supprimer le compte pour le moment. Réessaie plus tard.",
      );
      return;
    }

    await supabase.auth.signOut();
    router.replace("/onboarding/connexion");
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
        >
          <Ionicons name="arrow-back" size={20} color={C.iconeBouton} />
        </TouchableOpacity>
        <Text style={[styles.titre, { color: C.texte }]}>Profil</Text>
        <View style={{ width: 36 }} />
      </View>

      <SyncErrorBanner />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.sectionLabel, { color: C.texteMuted }]}>
          INFORMATIONS
        </Text>
        <View style={[styles.carte, { backgroundColor: C.carte, borderColor: C.carteBorder }, styleCarte(theme, C.purple)]}>
          <View style={styles.avatarSection}>
            <TouchableOpacity
              style={[styles.avatarPreview, { backgroundColor: C.hero }]}
              onPress={changerPhotoProfil}
              activeOpacity={0.7}
              disabled={televersementEnCours}
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
        <View style={[styles.carte, { backgroundColor: C.carte, borderColor: C.carteBorder }, styleCarte(theme, C.bleuGris)]}>
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
            />
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: C.texteMuted }]}>
          DONNÉES
        </Text>
        <View style={[styles.carte, { backgroundColor: C.carte, borderColor: C.carteBorder }, styleCarte(theme, C.vert)]}>
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
        </View>

        <Text style={[styles.sectionLabel, { color: C.texteMuted }]}>
          COMPTE
        </Text>
        <View style={[styles.carte, { backgroundColor: C.carte, borderColor: C.carteBorder }, styleCarte(theme, C.peach)]}>
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
        animationType="slide"
        transparent
        onRequestClose={fermerModalMotDePasse}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalOverlayTouch}>
            <View style={[styles.modalCard, { backgroundColor: C.carte }]}>
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

              <TouchableOpacity
                style={[
                  styles.btnPrincipal,
                  {
                    backgroundColor: C.purple,
                    opacity: chargementMotDePasse ? 0.6 : 1,
                    marginTop: 18,
                  },
                ]}
                onPress={changerMotDePasse}
                activeOpacity={0.7}
                disabled={chargementMotDePasse}
              >
                {chargementMotDePasse ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.btnPrincipalTexte}>Enregistrer</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.btnAnnuler}
                onPress={fermerModalMotDePasse}
                activeOpacity={0.7}
              >
                <Text style={[styles.btnAnnulerTexte, { color: C.texteMuted }]}>
                  Annuler
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={modalExportVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalExportVisible(false)}
      >
        <View style={styles.modalOverlayTouch}>
          <View style={[styles.modalCard, { backgroundColor: C.carte }]}>
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

            <TouchableOpacity
              style={[
                styles.btnPrincipal,
                {
                  backgroundColor: C.purple,
                  opacity: exportEnCours ? 0.6 : 1,
                  marginTop: 18,
                },
              ]}
              onPress={genererEtPartagerExport}
              activeOpacity={0.7}
              disabled={exportEnCours}
            >
              {exportEnCours ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.btnPrincipalTexte}>
                  Générer et partager
                </Text>
              )}
            </TouchableOpacity>

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
          </View>
        </View>
      </Modal>
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
  },
  btnSecondaireTexte: { fontSize: 14, fontWeight: "600" },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  switchLabel: { fontSize: 15, fontWeight: "600" },
  switchSub: { fontSize: 12, marginTop: 2 },
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

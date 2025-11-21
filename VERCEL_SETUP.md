# Configuration Vercel - Système de Signature

## Variables d'environnement à ajouter

Allez sur : https://vercel.com/YOUR_PROJECT/settings/environment-variables

### 1. Clé privée serveur (SECRET)

**Nom:** `ARKPUNKS_SERVER_PRIVATE_KEY`

**Valeur:**
```
f975bd28b55b014378b3d99e93f44c09b2567b4d3e304e8fbbf4045997516ecb
```

**Portée:** Production, Preview, Development

⚠️ **IMPORTANT:** Cette clé doit rester SECRÈTE. Ne JAMAIS la commiter dans git.

---

### 2. Clé publique serveur (PUBLIQUE)

**Nom:** `VITE_SERVER_PUBKEY`

**Valeur:**
```
efab2851167f159cd976ad9213fb8b9585dcf3b9549db7b668a46c32517239a3
```

**Portée:** Production, Preview, Development

✅ Cette clé est déjà hardcodée dans `src/config/arkade.ts` mais on l'ajoute aussi en env var pour flexibilité.

---

## Après configuration

1. **Redéployer le projet Vercel**
   - Les changements seront automatiquement déployés via git push
   - Ou forcer un redéploiement manuel dans Vercel

2. **Tester le système**
   - Aller sur votre app
   - Essayer de minter un nouveau punk
   - Vérifier dans la console : `✅ Server signature received`

3. **Vérifier le marketplace**
   - Seul votre punk #4315737c devrait apparaître
   - Les punks #585eea17 et #ea5dba6c seront filtrés (pas de signature)

---

## Résultat attendu

**AVANT (8 punks) :**
- #585eea17 - 1,344,239,492 sats (autre collection)
- #7a6930e2 - 50,000 sats (autre collection)
- #ea5dba6c - 500,000 sats (autre collection)
- #a0dc8ac6 - 100,000 sats (test zombie)
- #5015b7ef - 100,000 sats (test zombie)
- #30282c6c - 30,000,000 sats (autre collection)
- #c6aa2b34 - 50,000 sats (autre collection)
- #4315737c - 10,200 sats ✅ **VOTRE PUNK**

**APRÈS (1 punk) :**
- #4315737c - 10,200 sats ✅ **VOTRE PUNK** (whitelist legacy)

---

## Sécurité

### ✅ Ce qui est protégé
- Impossible de forger des signatures sans la clé privée
- Collections étrangères automatiquement filtrées
- Rate limiting : 5 mints/24h par utilisateur
- Supply cap : 1000 punks maximum

### 🔒 Garder secret
- `ARKPUNKS_SERVER_PRIVATE_KEY` - Ne JAMAIS partager
- Cette clé permet de signer les punks officiels

### ✅ Public (safe)
- `VITE_SERVER_PUBKEY` - Peut être partagée
- Déjà dans le code source (src/config/arkade.ts)

---

## Support

Si problème après déploiement :

1. **Vérifier les env vars dans Vercel**
   - Sont-elles bien définies ?
   - Portée correcte (Production, Preview, Development) ?

2. **Vérifier les logs Vercel**
   - Fonction `/api/mint/authorize`
   - Chercher : "Server private key not configured"

3. **Tester localement**
   - Créer `.env.local` avec les mêmes variables
   - `npm run serve`
   - Essayer de minter

4. **Forcer un redéploiement**
   - Parfois les env vars ne sont pas chargées immédiatement
   - Faire un commit vide : `git commit --allow-empty -m "Force redeploy"`

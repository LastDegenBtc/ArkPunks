# Setup du Wallet Escrow

Ce guide explique comment configurer le wallet escrow pour le marketplace automatique ArkPunks.

## Pourquoi un wallet escrow?

Le système escrow permet aux vendeurs de lister leurs punks **même quand ils sont offline**. Le serveur tient le punk en garantie et exécute automatiquement les ventes quand un acheteur paie.

## Configuration requise

Pour que le système fonctionne, tu as besoin de:

1. **Un wallet dédié** (clé privée + adresse)
2. **Liquidité initiale** (100,000 - 500,000 sats recommandés)
3. **Les deux variables d'environnement configurées dans Vercel:**
   - `ESCROW_WALLET_ADDRESS` - L'adresse publique (pour recevoir les fonds)
   - `ESCROW_WALLET_PRIVATE_KEY` - La clé privée (pour envoyer les fonds)

⚠️ **IMPORTANT:** Ces deux variables doivent être du **MÊME wallet**! L'adresse doit correspondre à la clé privée, sinon le système ne pourra pas dépenser les fonds reçus.

## Étape 1: Générer le wallet

### Automatique (recommandé)

```bash
npm run escrow:generate
```

Ce script:
- ✅ Génère un nouveau wallet Arkade
- ✅ Affiche les deux variables pour Vercel
- ✅ Vérifie que l'adresse correspond bien à la clé
- ✅ Te donne les instructions de configuration

### Manuel (avancé)

Si tu préfères utiliser un wallet existant:

1. Exporte la clé privée depuis ton wallet Arkade (format hex)
2. Récupère l'adresse correspondante
3. **Vérifie bien** que l'adresse dérive de cette clé privée

## Étape 2: Ajouter les variables dans Vercel

1. Va sur https://vercel.com/[ton-username]/ark-punks/settings/environment-variables

2. Ajoute les deux variables:

   **Variable 1:**
   ```
   Name: ESCROW_WALLET_ADDRESS
   Value: ark1qq4hfssprtcgnjzf8qlw2f78yvjau5kldfugg29k34y7j96q2w4t...
   Environment: Production, Preview, Development
   ```

   **Variable 2:**
   ```
   Name: ESCROW_WALLET_PRIVATE_KEY
   Value: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
   Environment: Production, Preview, Development
   ```

   ⚠️ **SÉCURITÉ:**
   - Garde la clé privée SECRÈTE
   - Ne la commit JAMAIS dans git
   - Ne la partage avec PERSONNE
   - Ce wallet détient les fonds du marketplace!

3. Sauvegarde et redéploie ton projet

## Étape 3: Ajouter de la liquidité

Le wallet escrow a besoin de liquidité pour payer les frais de transaction Arkade.

### Pourquoi de la liquidité?

Même les transferts off-chain ont des frais réseau:
- Chaque `sendBitcoin()` coûte ~100-500 sats
- Un atomic swap fait 2 transferts (punk + payment)
- Total: ~200-1000 sats par vente

### Montant recommandé

**Testnet (Mutinynet):** 100,000 - 200,000 sats
- Suffisant pour tester
- Gratuit via faucet

**Mainnet:** 100,000 - 500,000 sats (~$100-500 USD)
- Permet 100-500 ventes
- Les fees collectés (0.5%) rechargent le wallet progressivement

### Comment ajouter des fonds

#### Sur Testnet (Mutinynet)

```bash
# Utilise le faucet
# 1. Copie l'adresse escrow générée
# 2. Va sur https://faucet.mutinynet.com
# 3. Colle l'adresse et demande des sats
# 4. Attends 1-2 minutes pour confirmation
```

#### Sur Mainnet

Plusieurs options:

**Option A: Bitcoin on-chain → Arkade**
```bash
# 1. Envoie des BTC on-chain à l'adresse escrow
# 2. Utilise Arkade wallet/CLI pour onboard
# 3. Les fonds deviennent disponibles off-chain
```

**Option B: Depuis un autre wallet Arkade**
```bash
# Si tu as déjà un wallet Arkade avec des fonds:
arkade send <escrow-address> 100000
```

**Option C: Acheter via un exchange**
```bash
# Achète des BTC et envoie à l'adresse escrow
# Puis onboard via Arkade
```

## Étape 4: Vérifier le setup

### Test local

```bash
# 1. Configure les variables dans .env.local:
echo "ESCROW_WALLET_ADDRESS=ark1..." >> .env.local
echo "ESCROW_WALLET_PRIVATE_KEY=0123..." >> .env.local

# 2. Lance le serveur local
npm run serve

# 3. Test le processeur
npm run escrow:check
```

### Test sur Vercel

```bash
# Appelle l'endpoint du processeur
curl -X POST https://arkpunks.com/api/escrow/process

# Tu devrais voir:
{
  "success": true,
  "depositsDetected": 0,
  "swapsExecuted": 0,
  "errors": []
}
```

### Vérifier les logs

Dans Vercel:
1. Va sur https://vercel.com/[username]/ark-punks/logs
2. Cherche "Escrow wallet initialized"
3. Tu devrais voir:
   ```
   🔐 Escrow wallet initialized
      Address: ark1qq4hfs...
      Balance: 100000 sats
   ```

⚠️ Si tu vois des warnings:
```
⚠️  WARNING: Wallet address mismatch!
   Expected: ark1abc...
   Got:      ark1xyz...
```
→ Les variables ne correspondent pas! Régénère le wallet ou corrige les variables.

```
⚠️  WARNING: Low escrow wallet balance!
   Current: 1000 sats
   Recommended: 10000 sats minimum
```
→ Ajoute des fonds au wallet escrow.

## Étape 5: Tester une vente complète

1. **Liste un punk en escrow**
   - Va sur l'app
   - Clique "List for Sale" sur un punk que tu possèdes
   - Choisis "Escrow Mode" (OK dans le confirm dialog)
   - Note l'adresse escrow retournée

2. **Envoie le punk à l'escrow**
   - Utilise ton wallet Arkade
   - Envoie le punk VTXO à l'adresse escrow reçue
   - Attends 1-2 minutes

3. **Vérifie la détection**
   ```bash
   curl "https://arkpunks.com/api/escrow/status?punkId=<ton-punk-id>"
   ```
   Le status devrait passer de `pending` → `deposited`

4. **Simule un achat** (avec un autre wallet)
   - Clique "Buy" sur le punk listé
   - Note les instructions de paiement
   - Envoie le montant exact (prix + 0.5% fee)
   - Attends 1-2 minutes pour le prochain cron

5. **Vérifie l'atomic swap**
   - Check les logs Vercel
   - Tu devrais voir:
     ```
     💸 Payment detected for punk...
     ✅ Atomic swap completed!
        Punk sent to buyer: txid1
        Payment sent to seller: txid2
        Marketplace fee: 500 sats
     ```

6. **Confirme les résultats**
   - Le buyer a reçu le punk
   - Le seller a reçu le paiement (minus 0.5%)
   - L'escrow wallet garde la fee

## Auto-suffisance du wallet

Le système est conçu pour être auto-suffisant:

```
Exemple: Vente à 100,000 sats

Buyer paie:    100,500 sats (100k + 0.5% fee)
               ↓
Escrow wallet reçoit: 100,500 sats
               ↓
Dépenses:
  - Punk → Buyer:         -200 sats (tx fee)
  - Payment → Seller:   -100,000 sats
  - Tx fee seller:        -200 sats
               ↓
Reste dans escrow: 100 sats de profit net! ✅
```

Donc après ~100 ventes, le wallet se recharge complètement par les fees collectés.

## Monitoring et maintenance

### Vérifier la balance régulièrement

```bash
# Via l'API
curl "https://arkpunks.com/api/escrow/process"

# Regarde le champ "Balance:" dans les logs
```

### Ajouter des fonds si nécessaire

Si la balance descend sous 10,000 sats:
1. Envoie plus de sats à l'adresse escrow
2. Ou utilise les fees accumulés (ils restent dans le wallet)

### Backup de la clé privée

⚠️ **CRITIQUE:** Sauvegarde la clé privée dans plusieurs endroits sécurisés:
- Password manager (1Password, Bitwarden, etc.)
- Hardware security key (YubiKey, Ledger, etc.)
- Papier sécurisé dans un coffre

Si tu perds la clé privée:
- ❌ Les fonds escrow sont bloqués à jamais
- ❌ Les ventes futures ne peuvent plus se faire
- ❌ Il faut tout recommencer avec un nouveau wallet

## Troubleshooting

### "Cannot find module @arkade-os/sdk"

```bash
npm install @arkade-os/sdk
```

### "ESCROW_WALLET_PRIVATE_KEY not configured"

→ Ajoute la variable dans Vercel et redéploie

### "Wallet address mismatch"

→ Les deux variables ne correspondent pas au même wallet
→ Régénère avec `npm run escrow:generate`

### "Insufficient balance for swap"

→ Ajoute des fonds au wallet escrow
→ Minimum 10,000 sats recommandé

### "Payment detected but swap failed"

→ Check les logs Vercel pour l'erreur exacte
→ Vérifie que le wallet a assez de balance
→ Vérifie que les adresses buyer/seller sont valides

## Support

Si tu rencontres des problèmes:
1. ✅ Check les logs Vercel: https://vercel.com/[username]/ark-punks/logs
2. ✅ Test l'endpoint: `curl -X POST https://arkpunks.com/api/escrow/process`
3. ✅ Vérifie les variables d'environnement
4. ✅ Vérifie la balance du wallet
5. ❓ Ouvre une issue sur GitHub avec les logs

## Ressources

- [Documentation Arkade SDK](https://github.com/arkade-os/ts-sdk)
- [Mutinynet Faucet](https://faucet.mutinynet.com)
- [Documentation système escrow](api/escrow/ESCROW_SYSTEM.md)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)

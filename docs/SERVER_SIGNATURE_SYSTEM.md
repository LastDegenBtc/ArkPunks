# Server Signature System

## Overview

Le système de signature serveur garantit que seuls les punks mintés via l'application officielle ArkPunks sont considérés comme officiels. Cela empêche les collections contrefaites d'apparaître dans le marketplace.

## Comment ça fonctionne

### 1. Génération de clé serveur

Le serveur possède une paire de clés cryptographiques :
- **Clé privée** : Gardée secrète sur le serveur Vercel (env var)
- **Clé publique** : Embarquée dans l'app pour vérification

```bash
# Générer la paire de clés
tsx scripts/generate-server-key.ts
```

### 2. Flow de mint avec signature

```
┌─────────────┐
│   Client    │
│  (Browser)  │
└──────┬──────┘
       │
       │ 1. Mint punk
       │
       ▼
┌─────────────┐
│   Client    │
│  Génère     │
│  punkId     │
└──────┬──────┘
       │
       │ 2. Demande signature
       │ POST /api/mint/authorize
       │ { punkId, userPubkey, currentSupply }
       │
       ▼
┌─────────────────────┐
│  Serveur Vercel     │
│                     │
│  1. Vérifie supply  │
│  2. Vérifie rate    │
│  3. Signe punkId    │
│                     │
│  signature =        │
│  sign(punkId, key)  │
└──────┬──────────────┘
       │
       │ 3. Retourne signature
       │ { signature, serverPubkey }
       │
       ▼
┌─────────────┐
│   Client    │
│  Publie sur │
│  Nostr avec │
│  signature  │
└──────┬──────┘
       │
       │ 4. Event Nostr
       │ tags: [
       │   ['punk_id', punkId],
       │   ['server_sig', signature],  ← PROOF!
       │   ...
       │ ]
       │
       ▼
┌─────────────┐
│  Nostr      │
│  Relays     │
└─────────────┘
```

### 3. Vérification de signature

Quand l'app charge les punks :

```typescript
// officialPunkValidator.ts
function verifyPunkSignature(punkId: string, signature?: string): boolean {
  // 1. Check legacy whitelist (pre-signature punks)
  if (LEGACY_WHITELIST.includes(punkId)) {
    return true
  }

  // 2. Verify schnorr signature
  const messageHash = sha256(punkId)
  return schnorr.verify(signature, messageHash, SERVER_PUBKEY)
}
```

## Installation

### 1. Générer les clés

```bash
tsx scripts/generate-server-key.ts
```

Cela générera :
- `ARKPUNKS_SERVER_PRIVATE_KEY` (secret)
- `VITE_SERVER_PUBKEY` (public)

### 2. Configurer Vercel

Ajoutez les variables d'environnement dans Vercel :

```
ARKPUNKS_SERVER_PRIVATE_KEY=<private-key-hex>
VITE_SERVER_PUBKEY=<public-key-hex>
```

Portée : Production + Preview + Development

### 3. (Optionnel) Hardcoder la clé publique

Dans `src/config/arkade.ts` :

```typescript
export const SERVER_SIGNING_CONFIG = {
  SERVER_PUBKEY: '1234567890abcdef...', // Coller la clé publique ici
  ...
}
```

Cela améliore l'UX (pas besoin d'attendre l'env var).

### 4. Whitelist les punks legacy

Dans `src/config/arkade.ts`, ajoutez les punks légitimes mintés AVANT le système de signature :

```typescript
LEGACY_WHITELIST: [
  '4315737c48d9f52eb87abcf5a14fa59d1be9a5c6c97ea8a926d18ef94e09c63a', // Votre premier punk
  'abc123...', // Autre punk légitime
]
```

### 5. Déployer

```bash
git add .
git commit -m "Add: Server signature system for official punk validation"
git push
```

Vercel redéploiera automatiquement avec les nouvelles env vars.

## Sécurité

### ✅ Ce qui est protégé

- **Impossibilité de forger** : Sans la clé privée serveur, impossible de créer une signature valide
- **Collections séparées** : Les punks d'autres collections n'auront jamais de signature valide
- **Rate limiting** : Le serveur contrôle combien de punks peuvent être mintés
- **Supply cap** : Le serveur valide la limite de 1000 punks

### ⚠️ Points d'attention

- **Clé privée compromise** : Si la clé privée fuite, tout le système doit être regénéré
  - Solution : Rotation de clés (nouveau système de génération)

- **Punks legacy** : Les punks mintés avant le système doivent être whitelistés manuellement
  - Solution : Maintenir `LEGACY_WHITELIST` à jour

- **Serveur down** : Si l'API `/api/mint/authorize` est down, personne ne peut minter
  - Solution : Monitoring et alertes sur l'endpoint

## Architecture

### Fichiers modifiés

```
api/mint/authorize.ts              ← Nouveau : API de signature
scripts/generate-server-key.ts     ← Nouveau : Générateur de clés
src/config/arkade.ts               ← Modifié : Config signature + whitelist
src/utils/officialPunkValidator.ts ← Modifié : Vérification signatures
src/utils/nostrRegistry.ts         ← Modifié : Demande signature au mint
```

### Variables d'environnement

| Variable | Type | Où | Description |
|----------|------|-----|-------------|
| `ARKPUNKS_SERVER_PRIVATE_KEY` | Secret | Vercel | Clé privée pour signer |
| `VITE_SERVER_PUBKEY` | Public | Vercel + Code | Clé publique pour vérifier |

## Testing

### Test local

1. Générer les clés :
   ```bash
   tsx scripts/generate-server-key.ts
   ```

2. Créer `.env.local` :
   ```
   ARKPUNKS_SERVER_PRIVATE_KEY=<your-private-key>
   VITE_SERVER_PUBKEY=<your-public-key>
   ```

3. Lancer le serveur :
   ```bash
   npm run serve
   ```

4. Tester le mint :
   - Ouvrir l'app
   - Minter un punk
   - Vérifier la console : "Server signature received"
   - Vérifier que le punk apparaît dans le marketplace

### Test de sécurité

1. **Test : Punk sans signature**
   - Créer un événement Nostr sans `server_sig` tag
   - Vérifier qu'il N'apparaît PAS dans le marketplace

2. **Test : Signature invalide**
   - Créer un événement avec une signature aléatoire
   - Vérifier qu'il N'apparaît PAS dans le marketplace

3. **Test : Punk whitelisté**
   - Vérifier que votre punk #4315737c apparaît
   - Même sans `server_sig` tag (legacy)

## Migration

### Punks existants

Tous les punks légitimes mintés AVANT ce système doivent être ajoutés à la whitelist :

```typescript
// src/config/arkade.ts
LEGACY_WHITELIST: [
  '4315737c48d9f52eb87abcf5a14fa59d1be9a5c6c97ea8a926d18ef94e09c63a',
  // Ajouter ici les autres punks légitimes
]
```

### Nouveaux punks

Tous les nouveaux punks (après déploiement) auront automatiquement une signature.

## FAQ

**Q: Que se passe-t-il si je perds la clé privée ?**
R: Vous devrez générer une nouvelle paire de clés et redéployer. Les anciens punks devront être ajoutés à la whitelist.

**Q: Quelqu'un peut-il voler ma clé privée ?**
R: Non, si elle est uniquement dans les env vars Vercel. Ne jamais la commiter dans git.

**Q: Les punks #585eea17 et #ea5dba6c disparaîtront-ils ?**
R: Oui ! Ils n'ont pas de signature serveur valide, donc ils seront automatiquement filtrés.

**Q: Puis-je changer la clé publique après déploiement ?**
R: Oui, mais vous devrez whitelister tous les punks signés avec l'ancienne clé.

**Q: Comment savoir si un punk est officiel ?**
R: Il doit soit (1) avoir une signature serveur valide OU (2) être dans LEGACY_WHITELIST.

## Monitoring

Logs à surveiller dans Vercel :

```
✅ Server signature received  → Mint réussi
❌ Server authorization failed → Rate limit ou supply cap
❌ Invalid signature          → Tentative de contrefaçon
```

## Support

En cas de problème :
1. Vérifier les env vars dans Vercel
2. Vérifier les logs de `/api/mint/authorize`
3. Vérifier que `VITE_SERVER_PUBKEY` est accessible côté client
4. Vérifier la whitelist dans `src/config/arkade.ts`

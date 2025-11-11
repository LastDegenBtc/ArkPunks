# Switch vers Mainnet Arkade

## URLs Mainnet (confirmées depuis arkade-os/wallet)

```typescript
arkServerUrl: 'https://arkade.computer'
esploraUrl: 'https://mempool.space/api'
bitcoinNetwork: 'bitcoin'
```

## Comment switcher

### Option 1: Via .env (Recommandé)

Édite [.env](.env) et change:

```bash
# Avant:
VITE_ARKADE_NETWORK=testnet

# Après:
VITE_ARKADE_NETWORK=mainnet
```

Puis redémarre le serveur:
```bash
npm run serve
```

### Option 2: Directement dans le code

Modifie [src/config/arkade.ts](src/config/arkade.ts):

```typescript
export const DEFAULT_CONFIG = MAINNET_CONFIG  // Au lieu de MUTINYNET_CONFIG
```

## ⚠️ PRÉCAUTIONS IMPORTANTES

### 1. **NOUVEAU WALLET OBLIGATOIRE**

**JAMAIS** utiliser les mêmes clés privées entre testnet et mainnet!

- Déconnecte ton wallet testnet
- Clique sur "Disconnect" dans l'interface
- Crée un NOUVEAU wallet pour mainnet
- **Sauvegarde tes clés** (localStorage pour dev uniquement!)

### 2. **Vrais Bitcoin**

Tu vas dépenser de **vrais sats** sur Bitcoin mainnet:
- Les transactions sont **irréversibles**
- Les frais sont **réels**
- Commence avec une **petite somme** (ex: 10,000 sats)

### 3. **Différences Mainnet vs Testnet**

| Paramètre | Testnet (Mutinynet) | Mainnet |
|-----------|---------------------|---------|
| Server | mutinynet.arkade.sh | arkade.computer |
| Esplora | mutinynet.com/api | mempool.space/api |
| Min VTXO | 1,000 sats | 10,000 sats |
| Fee rate | 1 sat/vB | 10 sat/vB |
| Prefix | `tb1p...` (testnet) | `bc1p...` (bitcoin) |
| Faucet | ✅ Gratuit | ❌ Vrais BTC requis |

### 4. **Test avant mint**

Avant de minter des punks:
1. ✅ Connecte wallet mainnet
2. ✅ Vérifie l'adresse boarding commence par `bc1p...`
3. ✅ Envoie **seulement 10-20k sats** pour tester
4. ✅ Teste le boarding complet
5. ✅ Teste un envoi off-chain simple
6. ⚠️  Seulement après: teste le mint d'un punk

## État actuel du projet

### ✅ Prêt pour mainnet
- Configuration mainnet validée (depuis code officiel)
- Support multi-réseau (testnet/mainnet/regtest)
- Wallet interface compatible
- Génération d'adresse adaptée au réseau

### ⚠️  Problèmes connus
- **Testnet boarding:** HTTP 500 sur mutinynet (en discussion avec dev Arkade)
- **Mainnet boarding:** Pas encore testé - peut avoir le même problème

### 🔜 À tester sur mainnet
- [ ] Boarding settlement (`Ramps.onboard()`)
- [ ] Mint de punk (transaction compression 6-byte)
- [ ] Envoi off-chain de punk
- [ ] Exit collaboratif

## Rollback vers Testnet

Si tu veux revenir au testnet:

```bash
# Dans .env
VITE_ARKADE_NETWORK=testnet
```

Puis:
1. Déconnecte wallet mainnet
2. Redémarre `npm run serve`
3. Reconnecte avec wallet testnet

## Budget estimé pour tests mainnet

| Opération | Coût estimé |
|-----------|-------------|
| Boarding (10k sats) | ~100 sats frais on-chain |
| Mint 1 punk | ~10 sats (off-chain VTXO) |
| Transfer off-chain | ~10 sats |
| Exit collaboratif | ~100 sats frais |
| **Total pour test complet** | **~1,000 sats** |

## Support

Si problème:
- **Testnet issues:** Voir [MUTINYNET_ISSUE.md](MUTINYNET_ISSUE.md) et [ARKADE_DEBUG_INFO.md](ARKADE_DEBUG_INFO.md)
- **Mainnet issues:** Telegram Arkade ou GitHub arkade-os/ts-sdk
- **Ce repo:** Logs console dans `npm run serve`

---

**Prêt à tester mainnet?** 🚀

Rappel: Commence PETIT (10-20k sats) et teste chaque étape avant de scaler!

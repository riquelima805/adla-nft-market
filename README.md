#  Adla NFT Market Interface & WooSDK Template

Welcome to the standard NFT Marketplace frontend for the **Adla** ecosystem (Fandom Collectibles & Arena de Fandons). 

This React application is designed to operate seamlessly within the Adla app, connecting directly to the same injected wallet used in the Adla DeFi interface. It serves as a robust, production-ready foundation for developers building decentralized marketplaces on Layer 3 networks using the **WooSDK**.

Whether you are launching a fandom collectibles shop, a gaming asset marketplace, or integrating NFT features into the **Woo Wallet**, this is your starting point.

---

##  How to adapt for WooSDK (Woo Wallet)

This code is pre-configured to look for the Adla wallet object (`window.adlaWallet`). To use this front-end as a base for your own WooSDK-powered L3 dApp or the Woo Wallet, the adaptation is quick and simple.

Just change the global injected object and the method prefixes to match your infrastructure.

**1. Change the typing and detection:**
Update the interface detection from `window.adlaWallet` to `window.wooWallet` (or your specific provider's name).

**2. Update the RPC methods:**
Replace the `adla_` prefix with the WooSDK standard in the `callBridge` function. For example:
* From `adla_nftBuy`  to `woo_nftBuy`
* From `adla_nftList`  to `woo_nftList`
* From `adla_nftMakeOffer`  to `woo_nftMakeOffer`

The rest of the architecture—including UI/UX, state management, sorting, and filtering—will continue to work flawlessly.

---

##  Included Features

This interface provides a complete, gamified NFT marketplace experience out of the box:

*  Home/Vault:** Displays the total estimated value of the user's collection, featured fandom items, and a quick wallet summary.
*  Market (A-Side & B-Side):** Browse available collectibles or manage your own storefront. Includes advanced filtering (Category, Rarity) and sorting mechanisms.
*  Offer System:** Users can place custom bids on unlisted or listed items, and owners can accept or decline incoming offers directly from the interface.
*  Collection Gallery:** A dedicated space to view owned assets (Tokens, Vaults, Badges, Cards, Passes) and locked achievements.
*  Wallet & Activity Log:** Real-time tracking of pending and confirmed transactions (buys, sells, listings, offers).
*  Built-in Demo Mode:** Allows developers and users to explore the entire UI with mock data without needing the actual wallet extension installed.

---

##  Provider Contract (Bridge)

Just like the DeFi module, this interface **does not store private keys**. It delegates all complex Layer 3 interactions and signatures to the injected wallet. The wallet extension must expose the following interface:

### Expected Methods
- `adla_requestAccounts` → `string[]` *(Opens connection popup)*
- `adla_accounts` → `string[]` *(Silent account query)*
- `adla_nftBuy` → `{ txId }` *(Direct purchase)*
- `adla_nftMakeOffer` → `{ txId }` *(Propose a price)*
- `adla_nftList` → `{ txId }` *(List an owned item for sale)*
- `adla_nftUnlist` → `{ txId }` *(Remove an item from the market)*
- `adla_nftAcceptOffer` → `{ txId }` *(Accept an incoming bid)*
- `adla_nftDeclineOffer` → `{ txId }` *(Reject an incoming bid)*

### Expected Events (`provider.on`)
- `accountsChanged (string[])`
- `chainChanged (string)`
- `disconnect ()`

---

##  Running the project

To start the local development environment:

```bash
# Install dependencies
npm install

# Start the server
npm start

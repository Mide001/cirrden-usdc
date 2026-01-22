import { CdpClient } from "@coinbase/cdp-sdk";
import dotenv from "dotenv";
import { createPublicClient, http, formatUnits } from "viem";
import { base } from "viem/chains";

dotenv.config();

const cdpClient = new CdpClient({
    apiKeyId: process.env.CDP_API_KEY_ID!,
    apiKeySecret: process.env.CDP_API_KEY_SECRET!,
    walletSecret: process.env.CDP_WALLET_SECRET!,
});

(async () => {
    try {
        // 1. Setup Your Treasury Wallet
        // We use a persistent name so we get the same wallet every time.
        const ledgerAccount = await cdpClient.evm.getOrCreateAccount({
            name: "techwithmide-0x" // replace with your own (wallet) name
        });

        console.log(`\n🏦 Treasury Address: ${ledgerAccount.address}`);
        console.log("-> Share this address with your users for payments.\n");

        // 2. Setup Blockchain Reader (Viem)
        const publicClient = createPublicClient({
            chain: base,
            transport: http()
        });

        // 3. Payment Verification Logic
        // This function confirms if a specific transaction sent the correct amount to your treasury.
        // It relies on the Transaction Hash provided by the user after they pay.
        const verifyTransaction = async (txHash: string, expectedAmount: number) => {
            console.log(`🔍 Checking Transaction: ${txHash}...`);

            try {
                // Get transaction receipt from the blockchain
                const receipt = await publicClient.getTransactionReceipt({
                    hash: txHash as `0x${string}`
                });

                if (receipt.status !== 'success') {
                    console.log("❌ Transaction failed or reverted.");
                    return false;
                }

                // Filter for USDC transfer logs
                const USDC_ADDRESS = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
                const usdcLogs = receipt.logs.filter(log =>
                    log.address.toLowerCase() === USDC_ADDRESS.toLowerCase()
                );

                for (const log of usdcLogs) {
                    // Check destination address (topics[2])
                    const toTopic = log.topics[2];
                    if (!toTopic) continue;

                    // Remove padding to get the clean address
                    const toAddress = `0x${toTopic.slice(26)}`;

                    // Verify if the money went to YOUR treasury
                    if (toAddress.toLowerCase() === ledgerAccount.address.toLowerCase()) {
                        // Decode the amount (USDC has 6 decimals)
                        const valueBigInt = BigInt(log.data);
                        const formattedValue = formatUnits(valueBigInt, 6);

                        console.log(`✅ Transfer Found: ${formattedValue} USDC -> Treasury`);

                        if (parseFloat(formattedValue) === expectedAmount) {
                            console.log(`🎉 VERIFIED: Amount matches!`);
                            return true;
                        } else {
                            console.log(`⚠️ MISMATCH: Expected ${expectedAmount}, got ${formattedValue}`);
                        }
                    }
                }
                console.log("❌ No USDC transfer to treasury found in this transaction.");

            } catch (err) {
                console.error("Verification failed (Invalid Hash?):", err);
            }
            return false;
        };

        // --- Usage Example ---
        const amountExpected = 0.01;
        const mockTxHash = "0x488cb8fd62ab7000751312fc24b21d99ae3bf44700f94ef51d1d4fc76270a858";

        await verifyTransaction(mockTxHash, amountExpected);

        // 4. Check Final Treasury Balance
        // We use the SDK to check the total confirmed balance
        const balances = await cdpClient.evm.listTokenBalances({
            address: ledgerAccount.address,
            network: "base"
        });

        console.log("\n💰 Treasury Holdings:", balances.balances);

    } catch (error) {
        console.error("Critical Error:", error);
    }
})();
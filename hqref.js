const { ethers } = require('ethers');
const fs = require('fs').promises;
const readline = require('readline');
const axios = require('axios');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const API_URL = "https://api.hackquest.io/graphql";
const REDIRECT_URL_BASE = "https://www.hackquest.io/?type=email-check&inviteCode=";
const DAILY_MISSION_ID = "e3fab3d3-e986-4076-9551-b265edaf454d";

const headers = {
    "accept": "application/graphql-response+json",
    "content-type": "application/json",
    "accept-language": "en-US,en;q=0.9",
    "sec-ch-ua": "\"Chromium\";v=\"134\", \"Not:A-Brand\";v=\"24\", \"Microsoft Edge\";v=\"134\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"Windows\"",
    "Referer": "https://www.hackquest.io/",
    "Referrer-Policy": "strict-origin-when-cross-origin"
};

const petNames = ["Dragon", "Phoenix", "Unicorn", "Griffin", "Pegasus", "Sphinx"];

function getRandomPetName() {
    return petNames[Math.floor(Math.random() * petNames.length)] + Math.floor(Math.random() * 1000);
}

async function readInviteCode() {
    try {
        const data = await fs.readFile('code.txt', 'utf8');
        const codes = data.split('\n').map(code => code.trim()).filter(code => code);
        return codes.length > 0 ? codes[0] : "EST5AHMX7H"; 
    } catch (error) {
        console.error('[ERROR] Failed to read code.txt, using default:', error.message);
        return "EST5AHMX7H";
    }
}

async function generateWallet() {
    console.log('[INFO] Generating new wallet');
    const wallet = ethers.Wallet.createRandom();
    return {
        address: wallet.address,
        privateKey: wallet.privateKey,
        mnemonic: wallet.mnemonic.phrase
    };
}

async function signupWallet(wallet, inviteCode) {
    console.log('[INFO] Signing up wallet:', wallet.address);
    const redirectUrl = `${REDIRECT_URL_BASE}${inviteCode}`;
    const signupQuery = {
        query: `
            mutation LoginByWallet($input: SignInByWalletInput!) {
                loginByWallet(input: $input) {
                    access_token
                    user { ...baseUserInfo }
                }
            }
            fragment baseUserInfo on UserExtend {
                id uid name avatar username nickname email role voteRole status inviteCode invitedBy
                hackCoin { coin } levelInfo { level exp }
            }
        `,
        variables: { input: { account: wallet.address, redirectUrl } }
    };

    try {
        const response = await axios.post(API_URL, signupQuery, { headers });
        return response.data;
    } catch (error) {
        console.error('[ERROR] Signup failed:', error.message);
        throw error;
    }
}

async function activateUser(accessToken, inviteCode) {
    console.log('[INFO] Activating user with token');
    const activateQuery = {
        query: `
            mutation ActivateUser($accessToken: String!, $inviteCode: String) {
                activateUser(access_token: $accessToken, inviteCode: $inviteCode) {
                    access_token user { ...baseUserInfo } status error
                }
            }
            fragment baseUserInfo on UserExtend {
                id uid name avatar username nickname email role voteRole status inviteCode invitedBy
                hackCoin { coin } levelInfo { level exp }
            }
        `,
        variables: { accessToken, inviteCode }
    };

    try {
        const response = await axios.post(API_URL, activateQuery, { headers });
        return response.data;
    } catch (error) {
        console.error('[ERROR] Activation failed:', error.message);
        throw error;
    }
}

async function completeGuideStep(accessToken, step) {
    console.log(`[INFO] Completing guide step ${step}`);
    const guideQuery = {
        query: `
            mutation UpdateUserSettings($input: UserSettingsCreateInput!) {
                updateUserSettings(input: $input)
            }
        `,
        variables: { input: { guideStep: step } }
    };

    try {
        const authHeaders = { ...headers, "authorization": `Bearer ${accessToken}` };
        const response = await axios.post(API_URL, guideQuery, { headers: authHeaders });
        
        if (!response.data.data?.updateUserSettings) {
            console.error(`[ERROR] Guide step ${step} failed:`, 
                response.data.errors ? response.data.errors[0].message : 'Unknown error');
            return false;
        }
        return true;
    } catch (error) {
        console.error(`[ERROR] Guide step ${step} request failed:`, error.message);
        return false;
    }
}

async function createPet(accessToken) {
    const petName = getRandomPetName();
    console.log('[INFO] Creating pet with name:', petName);
    const createPetQuery = {
        query: `
            mutation CreatePet($name: String!) {
                createPet(name: $name) {
                    id name level exp expNextLevel userId hatch extra
                }
            }
        `,
        variables: { name: petName }
    };

    try {
        const authHeaders = { ...headers, "authorization": `Bearer ${accessToken}` };
        const response = await axios.post(API_URL, createPetQuery, { headers: authHeaders });
        return response.data;
    } catch (error) {
        console.error('[ERROR] Pet creation failed:', error.message);
        throw error;
    }
}

async function getPetData(accessToken) {
    console.log('[INFO] Fetching pet data');
    const petQuery = {
        query: `
            query MyPet {
                myPet {
                    exp expCurrentLevel expNextLevel extra id level name userId
                }
            }
        `
    };

    try {
        const authHeaders = { ...headers, "authorization": `Bearer ${accessToken}` };
        const response = await axios.post(API_URL, petQuery, { headers: authHeaders });
        return response.data;
    } catch (error) {
        console.error('[ERROR] Get pet data failed:', error.message);
        throw error;
    }
}

async function getMissions(accessToken) {
    console.log('[INFO] Fetching missions data');
    const missionsQuery = {
        query: `
            query Missions {
                missions {
                    id name group loopMode type action condition target exp coin
                    progress { completed claimed progress }
                }
            }
        `
    };

    try {
        const authHeaders = { ...headers, "authorization": `Bearer ${accessToken}` };
        const response = await axios.post(API_URL, missionsQuery, { headers: authHeaders });
        return response.data;
    } catch (error) {
        console.error('[ERROR] Get missions failed:', error.message);
        throw error;
    }
}

async function claimDailyMission(accessToken) {
    console.log('[INFO] Claiming daily mission');
    const claimQuery = {
        query: `
            mutation ClaimMissionReward($missionId: String!) {
                claimMissionReward(missionId: $missionId) {
                    coin exp
                }
            }
        `,
        variables: { missionId: DAILY_MISSION_ID }
    };

    try {
        const authHeaders = { ...headers, "authorization": `Bearer ${accessToken}` };
        const response = await axios.post(API_URL, claimQuery, { headers: authHeaders });
        
        if (!response.data.data?.claimMissionReward) {
            console.error('[ERROR] Daily mission claim failed:', 
                response.data.errors ? response.data.errors[0].message : 'Unknown error');
        }
        return response.data;
    } catch (error) {
        console.error('[ERROR] Claim mission request failed:', error.message);
        return { errors: [{ message: error.message }] };
    }
}

async function feedPet(accessToken, amount) {
    console.log(`[INFO] Feeding pet with amount: ${amount} coins`);
    const feedQuery = {
        query: `
            mutation FeedPet($amount: Float!) {
                feedPet(amount: $amount) {
                    userId level exp
                }
            }
        `,
        variables: { amount }
    };

    try {
        const authHeaders = { ...headers, "authorization": `Bearer ${accessToken}` };
        const response = await axios.post(API_URL, feedQuery, { headers: authHeaders });
        
        if (!response.data.data?.feedPet) {
            console.error('[ERROR] Feed pet failed:', 
                response.data.errors ? response.data.errors[0].message : 'Unknown error');
            return null;
        }
        return response.data;
    } catch (error) {
        console.error('[ERROR] Feed pet request failed:', error.message);
        return null;
    }
}

async function saveWallets(wallets) {
    try {
        console.log('[INFO] Saving wallets to file');
        await fs.writeFile('wallets.json', JSON.stringify(wallets, null, 2));
        console.log('[SUCCESS] Wallets saved to wallets.json');
    } catch (error) {
        console.error('[ERROR] Failed to save wallets:', error.message);
    }
}

async function main() {
    const inviteCode = await readInviteCode();
    console.log('[INFO] Using invite code:', inviteCode);

    rl.question('Enter the number of wallets to create: ', async (count) => {
        const walletCount = parseInt(count);
        if (isNaN(walletCount) || walletCount <= 0) {
            console.log('[ERROR] Please enter a valid number');
            rl.close();
            return;
        }

        const wallets = [];
        
        for (let i = 0; i < walletCount; i++) {
            console.log(`\n[INFO] Processing wallet ${i + 1}/${walletCount}`);
            
            try {
                const wallet = await generateWallet();
                console.log('[SUCCESS] Wallet generated:', wallet.address);

                const signupResponse = await signupWallet(wallet, inviteCode);
                if (!signupResponse.data?.loginByWallet) throw new Error('Signup failed');
                const signupToken = signupResponse.data.loginByWallet.access_token;
                console.log('[SUCCESS] Wallet signed up');

                const activateResponse = await activateUser(signupToken, inviteCode);
                if (!activateResponse.data?.activateUser) throw new Error('Activation failed');
                const accessToken = activateResponse.data.activateUser.access_token;
                console.log('[SUCCESS] User activated');

                for (let step = 1; step <= 5; step++) {
                    const guideSuccess = await completeGuideStep(accessToken, step);
                    if (!guideSuccess) throw new Error(`Guide step ${step} failed`);
                    console.log(`[SUCCESS] Guide step ${step} completed`);
                    await new Promise(resolve => setTimeout(resolve, 500));
                }

                const createPetResponse = await createPet(accessToken);
                if (!createPetResponse.data?.createPet) throw new Error('Pet creation failed');
                console.log('[SUCCESS] Pet created:', createPetResponse.data.createPet.name);

                const petDataResponse = await getPetData(accessToken);
                if (!petDataResponse.data?.myPet) throw new Error('Failed to get pet data');
                console.log('[SUCCESS] Pet data retrieved');

                const missionsResponse = await getMissions(accessToken);
                const dailyMission = missionsResponse.data?.missions.find(m => m.id === DAILY_MISSION_ID);
                if (dailyMission) {
                    console.log('[INFO] Daily mission status:', 
                        `Completed: ${dailyMission.progress?.completed || false}, `,
                        `Claimed: ${dailyMission.progress?.claimed || false}, `,
                        `Progress: ${dailyMission.progress?.progress || 'N/A'}`);
                }

                const claimResponse = await claimDailyMission(accessToken);
                let claimStatus = 'Failed';
                let feedResults = [];
                if (claimResponse.data?.claimMissionReward) {
                    console.log('[SUCCESS] Daily mission claimed');
                    claimStatus = 'Success';

                    // Feed pet 2 times (5 coins each)
                    for (let feedCount = 1; feedCount <= 2; feedCount++) {
                        const feedResponse = await feedPet(accessToken, 5);
                        if (feedResponse) {
                            console.log(`[SUCCESS] Pet fed ${feedCount}/2: Level ${feedResponse.data.feedPet.level}, Exp ${feedResponse.data.feedPet.exp}`);
                            feedResults.push(feedResponse.data.feedPet);
                        }
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }

                wallets.push({
                    wallet: {
                        address: wallet.address,
                        privateKey: wallet.privateKey,
                        mnemonic: wallet.mnemonic
                    },
                    signupData: signupResponse.data,
                    activationData: activateResponse.data,
                    petData: createPetResponse.data,
                    petInfo: petDataResponse.data,
                    missionsData: missionsResponse.data,
                    claimData: claimResponse.data,
                    feedData: feedResults
                });

                console.log(`Address = ${wallet.address}`);
                console.log(`Status = ${activateResponse.data.activateUser.status}`);
                console.log(`Pet Name = ${createPetResponse.data.createPet.name}`);
                console.log(`Pet Level = ${petDataResponse.data.myPet.level}`);
                console.log(`Reward = ${claimStatus === 'Success' ? 
                    `${claimResponse.data.claimMissionReward.coin} coins, ${claimResponse.data.claimMissionReward.exp} exp` : 
                    'Claim failed'}`);
                if (feedResults.length > 0) {
                    console.log(`Feed Results = Fed ${feedResults.length} times`);
                }
                
                if (i < walletCount - 1) {
                    console.log('====================');
                }
                
            } catch (error) {
                console.error(`[ERROR] Failed processing wallet ${i + 1}:`, error.message);
                if (i < walletCount - 1) {
                    console.log('====================');
                }
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        await saveWallets(wallets);
        rl.close();
    });
}

main().catch(error => console.error('[ERROR] Main process failed:', error.message));
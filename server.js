const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};
const RANKINGS_FILE = './rankings.json';

function calcValue(p) {
    try { return Number(p.cash) + (Number(p.brand) * 3000000) + (Number(p.employees) * 1000000) + (Number(p.marketShare) * 10000000) - Number(p.debt); } 
    catch(e) { return 0; }
}

const getAdCost = (marketShare) => 5000000 + (marketShare * 300000);
const getHireCost = (employees) => 7000000 + (Math.max(0, employees - 20) * 300000);

const aiNames = ['로지코어', '글로벌익스프레스', '코리아물류'];
function createAIs() {
    return aiNames.map((name, idx) => ({
        id: `ai_${idx}`, nickname: name, isAI: true,
        cash: 100000000, employees: 20, brand: 10, marketShare: 5, debt: 0, listed: false,
        companyValue: 200000000, actionsLeft: 1, researchSuccess: 0, bankrupt: false
    }));
}

function addLog(roomCode, msg) {
    try {
        if(!rooms[roomCode]) return;
        rooms[roomCode].logs.unshift(msg);
        if (rooms[roomCode].logs.length > 100) rooms[roomCode].logs.pop();
    } catch(e) {}
}

function stealMarketShare(winnerId, amount, roomCode) {
    try {
        const room = rooms[roomCode];
        if (!room) return 0;
        let gained = 0;
        const winner = [...Object.values(room.players), ...room.ais].find(p => p.id === winnerId);
        if (!winner) return 0;

        for (let i = 0; i < amount; i++) {
            if (room.npcMarketShare > 0) {
                room.npcMarketShare -= 1;
                winner.marketShare += 1;
                gained++;
            } else {
                let targets = [...Object.values(room.players), ...room.ais].filter(e => e.id !== winner.id && e.marketShare > 0 && !e.bankrupt);
                if (targets.length > 0) {
                    let victim = targets[Math.floor(Math.random() * targets.length)];
                    victim.marketShare -= 1;
                    victim.companyValue = calcValue(victim);
                    winner.marketShare += 1;
                    gained++;
                    addLog(roomCode, `⚔️ [${winner.nickname}]가 [${victim.nickname}]의 점유율 1% 강탈!`);
                }
            }
        }
        return gained;
    } catch (e) { return 0; }
}

io.on('connection', (socket) => {
    // ★ 게임 중단(새로고침, 탭 닫기) 시 유령 플레이어를 강제 파산시켜 진행을 안 멈추게 함
    socket.on('disconnect', () => {
        try {
            for (const roomCode in rooms) {
                const room = rooms[roomCode];
                if (room.players[socket.id]) {
                    room.players[socket.id].bankrupt = true; 
                    room.players[socket.id].actionsLeft = 0; 
                    addLog(roomCode, `🔌 [${room.players[socket.id].nickname}] 접속 종료 (기권/파산 처리)`);
                    io.to(roomCode).emit('updateRoom', room);
                }
            }
        } catch(e) { console.error(e); }
    });

    socket.on('createRoom', ({ nickname }) => {
        const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        rooms[roomCode] = {
            roomCode: roomCode, players: {}, ais: [], logs: [], news: '아직 뉴스 없음',
            status: 'waiting', timeRemaining: 240, turnTime: 30, npcMarketShare: 100
        };
        joinRoomLogic(socket, roomCode, nickname);
    });

    socket.on('joinRoom', ({ roomCode, nickname }) => {
        const targetCode = roomCode.toUpperCase().trim();
        if (!rooms[targetCode] || rooms[targetCode].status !== 'waiting') return socket.emit('errorMessage', '방이 존재하지 않거나 시작되었습니다.');
        if (Object.keys(rooms[targetCode].players).length >= 4) return socket.emit('errorMessage', '방이 꽉 찼습니다.');
        joinRoomLogic(socket, targetCode, nickname);
    });

    function joinRoomLogic(socket, roomCode, nickname) {
        socket.join(roomCode);
        rooms[roomCode].players[socket.id] = {
            id: socket.id, nickname, isAI: false,
            cash: 100000000, employees: 20, brand: 10, marketShare: 5, debt: 0, listed: false,
            companyValue: 200000000, actionsLeft: 1, researchSuccess: 0, ready: false, bankrupt: false
        };
        io.to(roomCode).emit('updateRoom', rooms[roomCode]);
    }

    socket.on('ready', (roomCode) => {
        try {
            const room = rooms[roomCode];
            if (!room) return;
            room.players[socket.id].ready = true;
            const playersArr = Object.values(room.players);
            if (playersArr.every(p => p.ready) && playersArr.length >= 1) startGame(roomCode);
            else io.to(roomCode).emit('updateRoom', room);
        } catch(e) {}
    });

    function startGame(roomCode) {
        try {
            const room = rooms[roomCode];
            if (!room || room.status === 'playing') return; 
            
            room.status = 'playing';
            room.ais = createAIs();
            
            const totalEntities = Object.keys(room.players).length + 3;
            room.npcMarketShare = Math.max(0, 100 - (totalEntities * 5));

            addLog(roomCode, '🚀 게임이 시작되었습니다! (제한시간 4분 / 파산 주의)');
            room.gameInterval = setInterval(() => gameTick(roomCode), 1000);
        } catch(e) {}
    }

    function gameTick(roomCode) {
        try {
            const room = rooms[roomCode];
            if (!room) return;
            room.timeRemaining--;
            room.turnTime--;

            const allEntities = [...Object.values(room.players), ...room.ais];
            allEntities.forEach(p => { p.companyValue = calcValue(p); });
            
            const overBillion = allEntities.find(p => p.companyValue >= 1000000000);
            const activePlayers = Object.values(room.players).filter(p => !p.bankrupt);

            if (room.timeRemaining <= 0 || overBillion || activePlayers.length === 0) {
                endGame(roomCode); return;
            }

            const allPlayersDone = activePlayers.length > 0 && activePlayers.every(p => p.actionsLeft <= 0);
            if (room.turnTime <= 0 || allPlayersDone) {
                processTurnEnd(roomCode);
                room.turnTime = 30;
            }
            io.to(roomCode).emit('updateRoom', room);
        } catch(e) { console.error("Tick Error:", e); }
    }

    function processTurnEnd(roomCode) {
        try {
            const room = rooms[roomCode];
            if (!room) return;
            
            const newsEvents = [
                { text: '글로벌 한류 열풍 (모든 생존 기업 브랜드 +3)', effect: p => p.brand += 3 },
                { text: '정부 중소기업 지원 (모든 생존 기업 자본금 +1,000만)', effect: p => p.cash += 10000000 },
                { text: '글로벌 경제 위기 (모든 생존 기업 자본금 -500만)', effect: p => p.cash -= 5000000 },
                { text: '최저임금 대폭 인상 (모든 생존 기업 세금 -800만)', effect: p => p.cash -= 8000000 }
            ];
            const randomNews = newsEvents[Math.floor(Math.random() * newsEvents.length)];
            room.news = randomNews.text;
            addLog(roomCode, `📰 뉴스: ${randomNews.text}`);

            const allEntities = [...Object.values(room.players), ...room.ais];
            const aiActionTypes = ['advertise', 'hire', 'research', 'foreign', 'loan', 'ipo'];
            
            allEntities.forEach(p => {
                if (p.bankrupt) return;

                const profit = p.marketShare * 500000;
                const salary = p.employees * 300000;
                const interest = p.debt * 0.04;
                const netIncome = profit - salary - interest;
                
                p.cash += netIncome;
                p.actionsLeft = 1; 
                randomNews.effect(p); 

                if(!p.isAI) {
                    const netType = netIncome >= 0 ? "흑자" : "적자";
                    addLog(roomCode, `💵 [${p.nickname}] 결산: ${netType} ${(netIncome/10000).toLocaleString()}만`);
                }

                if (p.isAI) {
                    const randomAct = aiActionTypes[Math.floor(Math.random() * aiActionTypes.length)];
                    const adCost = getAdCost(p.marketShare);
                    const hireCost = getHireCost(p.employees);

                    if (randomAct === 'advertise' && p.cash >= adCost) {
                        p.cash -= adCost; p.brand += 3; let gained = stealMarketShare(p.id, 1, roomCode);
                        addLog(roomCode, `🤖 [${p.nickname}] 마케팅 (-${adCost/10000}만 | 점유율 +${gained}%)`);
                    } else if (randomAct === 'hire' && p.cash >= hireCost) {
                        p.cash -= hireCost; p.employees += 5; addLog(roomCode, `🤖 [${p.nickname}] 영입 (-${hireCost/10000}만 | 직원 +5명)`);
                    } else if (randomAct === 'research' && p.cash >= 10000000) {
                        p.cash -= 10000000;
                        if (Math.random() <= 0.7) { p.brand += 5; let gained = stealMarketShare(p.id, 2, roomCode); addLog(roomCode, `🤖 [${p.nickname}] R&D 대성공! 점유율 +${gained}%`); }
                    } else if (randomAct === 'foreign' && p.cash >= 30000000) {
                        p.cash -= 30000000;
                        if (Math.random() <= 0.5) { p.cash += 60000000; let gained = stealMarketShare(p.id, 5, roomCode); addLog(roomCode, `🤖 [${p.nickname}] 글로벌 대박! 현금+6천만, 점유율+${gained}%`); }
                    } else if (randomAct === 'loan') {
                        p.cash += 50000000; p.debt += 50000000; addLog(roomCode, `🤖 [${p.nickname}] 자금 조달`);
                    } else if (randomAct === 'ipo' && calcValue(p) >= 300000000 && !p.listed) {
                        p.listed = true; p.cash += 100000000; p.brand += 5; addLog(roomCode, `🤖 [${p.nickname}] IPO 상장 성공`);
                    }
                }
                
                p.companyValue = calcValue(p);
                checkBankruptcy(p, roomCode); 
            });
        } catch(e) { console.error("Turn End Error:", e); }
    }

    function checkBankruptcy(p, roomCode) {
        try {
            if (!p.bankrupt && (p.cash <= -100000000 || p.companyValue <= -100000000)) {
                p.bankrupt = true;
                rooms[roomCode].npcMarketShare += p.marketShare; 
                p.cash = 0; p.companyValue = -100000000; p.marketShare = 0; p.employees = 0; p.brand = 0; p.actionsLeft = 0;
                addLog(roomCode, `☠️ [${p.nickname}] 파산했습니다! (보유 점유율 시장 환원)`);
            }
        } catch(e) {}
    }

    socket.on('action', ({ roomCode, actionType }) => {
        try {
            const room = rooms[roomCode];
            if (!room || room.status !== 'playing') return;
            
            const p = room.players[socket.id];
            if (!p || p.bankrupt || p.actionsLeft <= 0) return; // 행동력 없으면 안전하게 무시

            const adCost = getAdCost(p.marketShare);
            const hireCost = getHireCost(p.employees);

            switch(actionType) {
                case 'advertise':
                    if (p.cash >= adCost) { 
                        p.cash -= adCost; p.brand += 3; let gained = stealMarketShare(p.id, 1, roomCode);
                        addLog(roomCode, `📺 [${p.nickname}] 마케팅 (-${adCost/10000}만 | 브랜드+3, 점유율+${gained}%)`); 
                    } else return socket.emit('errorMessage', `자본금이 부족합니다. (현재 ${adCost.toLocaleString()}원 필요)`); break;
                case 'hire':
                    if (p.cash >= hireCost) { 
                        p.cash -= hireCost; p.employees += 5; 
                        addLog(roomCode, `👨 [${p.nickname}] 영입 (-${hireCost/10000}만 | 직원+5명)`); 
                    } else return socket.emit('errorMessage', `자본금이 부족합니다. (현재 ${hireCost.toLocaleString()}원 필요)`); break;
                case 'research':
                    if (p.cash >= 10000000) { p.cash -= 10000000;
                        if (Math.random() <= 0.7) { p.brand += 5; let gained = stealMarketShare(p.id, 2, roomCode); addLog(roomCode, `🧪 [${p.nickname}] R&D 대성공! (-1,000만 | 점유율+${gained}%)`); }
                        else addLog(roomCode, `🧪 [${p.nickname}] R&D 실패... (-1,000만 증발)`);
                    } else return socket.emit('errorMessage', '자본금이 부족합니다.'); break;
                case 'foreign':
                    if (p.cash >= 30000000) { p.cash -= 30000000;
                        if (Math.random() <= 0.5) { p.cash += 60000000; let gained = stealMarketShare(p.id, 5, roomCode); addLog(roomCode, `🌎 [${p.nickname}] 글로벌 대박! (+3,000만 흑자, 점유율+${gained}%)`); }
                        else addLog(roomCode, `🌎 [${p.nickname}] 글로벌 실패... (-3,000만 증발)`);
                    } else return socket.emit('errorMessage', '자본금이 부족합니다.'); break;
                case 'loan':
                    p.cash += 50000000; p.debt += 50000000; addLog(roomCode, `🏦 [${p.nickname}] 자금 조달 (+5,000만 현금, 부채 증가)`); break;
                case 'ipo':
                    if (p.companyValue >= 300000000 && !p.listed) { p.listed = true; p.cash += 100000000; p.brand += 5; addLog(roomCode, `📈 [${p.nickname}] IPO 상장 대성공! (+1억 수혈, 브랜드+5)`); } 
                    else return socket.emit('errorMessage', '상장 조건(기업가치 3억 이상) 미달이거나 이미 상장했습니다.'); break;
            }

            p.actionsLeft = 0; // 즉시 0으로 만듦
            p.companyValue = calcValue(p);
            checkBankruptcy(p, roomCode); 
            io.to(roomCode).emit('updateRoom', room);
        } catch (err) { console.error("Action Error:", err); }
    });

    // ... (프로필 및 endGame은 동일하게 동작)
    socket.on('searchProfile', (targetNickname) => {
        let rankings = { players: {} };
        try { if (fs.existsSync(RANKINGS_FILE)) rankings = JSON.parse(fs.readFileSync(RANKINGS_FILE, 'utf8')); } catch(e) {}
        if (rankings.players[targetNickname]) socket.emit('profileResult', { nickname: targetNickname, ...rankings.players[targetNickname] });
        else if (aiNames.includes(targetNickname)) socket.emit('profileResult', { nickname: targetNickname, highestValue: '봇 인공지능', gamesPlayed: '-', wins: '-', achievements: ['🤖 AI'] });
        else socket.emit('profileResult', { error: '기록이 존재하지 않는 CEO입니다.' });
    });

    function endGame(roomCode) {
        try {
            const room = rooms[roomCode];
            if(!room) return;
            clearInterval(room.gameInterval);
            
            const allEntities = [...Object.values(room.players), ...room.ais].sort((a, b) => b.companyValue - a.companyValue);
            let rankings = { players: {} };
            if (fs.existsSync(RANKINGS_FILE)) rankings = JSON.parse(fs.readFileSync(RANKINGS_FILE, 'utf8'));
            
            Object.values(room.players).forEach(p => {
                if (!rankings.players[p.nickname]) rankings.players[p.nickname] = { gamesPlayed: 0, wins: 0, highestValue: 0, totalRank: 0, rankCount: 0, achievements: [] };
                const pData = rankings.players[p.nickname];
                pData.gamesPlayed++;
                const myRank = allEntities.findIndex(e => e.id === p.id) + 1;
                pData.totalRank += myRank; pData.rankCount++;
                if (p.companyValue > pData.highestValue) pData.highestValue = p.companyValue;
                if (myRank === 1 && !p.bankrupt) pData.wins++;

                const ach = new Set(pData.achievements);
                if (myRank === 1 && !p.bankrupt) ach.add('🏆 FIRST_WIN (첫 승리)');
                if (p.companyValue >= 200000000) ach.add('💎 VALUE_200M (기업가치 2억)');
                if (p.companyValue >= 500000000) ach.add('👑 VALUE_500M (기업가치 5억)');
                if (pData.wins >= 3) ach.add('🔥 THREE_WINS (3승 달성)');
                if (p.marketShare >= 30) ach.add('📊 MARKET_30 (점유율 30%)');
                if (p.researchSuccess >= 10) ach.add('🧪 RND_MASTER (R&D 10회 성공)');
                if (p.bankrupt) ach.add('☠️ BANKRUPT (파산 경험)');
                pData.achievements = Array.from(ach);
            });
            fs.writeFileSync(RANKINGS_FILE, JSON.stringify(rankings, null, 2));
            io.to(roomCode).emit('gameEnded', { winner: allEntities[0], ranking: allEntities });
            delete rooms[roomCode];
        } catch(e) {}
    }
});

server.listen(3000, () => console.log('✅ 철통 보안 서버 정상 가동 중!'));
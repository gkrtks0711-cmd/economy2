const socket = io();

const loginScreen = document.getElementById('loginScreen');
const gameScreen = document.getElementById('gameScreen');
const nicknameInput = document.getElementById('nickname');
const roomCodeInput = document.getElementById('roomCode');
const actionBtnIds = ['advertiseBtn', 'hireBtn', 'researchBtn', 'foreignBtn', 'loanBtn', 'ipoBtn', 'paybackBtn'];

let myRoomCode = '';

document.getElementById('createRoomBtn').onclick = () => {
    if(!nicknameInput.value) return alert('CEO 닉네임을 설정하세요!');
    socket.emit('createRoom', { nickname: nicknameInput.value });
};

document.getElementById('joinRoomBtn').onclick = () => {
    if(!nicknameInput.value || !roomCodeInput.value) return alert('닉네임과 방 코드를 입력하세요!');
    myRoomCode = roomCodeInput.value.toUpperCase().trim();
    socket.emit('joinRoom', { roomCode: myRoomCode, nickname: nicknameInput.value });
};

document.getElementById('readyBtn').onclick = () => {
    if(!myRoomCode) return;
    socket.emit('ready', myRoomCode);
    document.getElementById('readyBtn').innerText = '준비 대기 중...';
    document.getElementById('readyBtn').disabled = true;
};

const actions = [ 
    {id:'advertiseBtn', type:'advertise'}, {id:'hireBtn', type:'hire'}, 
    {id:'researchBtn', type:'research'}, {id:'foreignBtn', type:'foreign'}, 
    {id:'loanBtn', type:'loan'}, {id:'ipoBtn', type:'ipo'}, {id:'paybackBtn', type:'payback'} 
];
actions.forEach(act => {
    const btn = document.getElementById(act.id);
    if (btn) btn.onclick = () => { 
        if (myRoomCode) socket.emit('action', { roomCode: myRoomCode, actionType: act.type });
    };
});

socket.on('errorMessage', (msg) => alert(`[경고]\n${msg}`));

socket.on('updateRoom', (room) => {
    myRoomCode = room.roomCode;
    if(loginScreen.style.display !== 'none') { loginScreen.style.display = 'none'; gameScreen.style.display = 'block'; }

    document.getElementById('roomCodeDisplay').innerText = myRoomCode;
    document.getElementById('timerDisplay').innerText = room.timeRemaining;
    document.getElementById('newsBox').innerText = room.news;
    
    const npcShareElem = document.getElementById('npcShareDisplay');
    if (npcShareElem) npcShareElem.innerText = room.npcMarketShare;

    const me = room.players[socket.id];
    if(me) {
        if (me.bankrupt) {
            document.getElementById('myCompany').innerHTML = `<div style="color:#ef4444; font-size:1.5rem; font-weight:bold; text-align:center; padding: 40px 10px;">☠️ 파산 (GAME OVER)</div>`;
            actionBtnIds.forEach(id => { const btn = document.getElementById(id); if(btn) {btn.disabled = true;} });
        } else {
            const adCost = 5000000 + (me.marketShare * 300000);
            const hireCost = 7000000 + (Math.max(0, me.employees - 20) * 300000);
            const expectedProfit = me.marketShare * 500000;
            const expectedSalary = me.employees * 300000;
            const expectedInterest = me.debt * 0.04;
            const netFlow = expectedProfit - expectedSalary - expectedInterest;
            const netColor = netFlow >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
            const netSign = netFlow > 0 ? '+' : '';

            // 세련된 가로 정렬 UI 적용
            document.getElementById('myCompany').innerHTML = `
                <div class="cash-box">
                    <div style="color:var(--text-sub); font-size:1rem; text-align:left; margin-bottom:5px;">💰 보유 현금</div>
                    <div class="cash-val">${me.cash.toLocaleString()} <span style="font-size:1.2rem; color:var(--text-main);">원</span></div>
                    <div class="cash-flow" style="color:${netColor}">↳ 턴당 예상 흐름: ${netSign}${netFlow.toLocaleString()} 원</div>
                </div>
                <div class="stat-row">
                    <span class="stat-label">🏢 기업 가치:</span>
                    <span class="stat-val" style="color:var(--accent-gold);">${me.companyValue.toLocaleString()} 원</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">👨 상주 임직원:</span>
                    <span class="stat-val">${me.employees} 명</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">⭐ 브랜드 지수:</span>
                    <span class="stat-val">${me.brand} pt</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">📊 시장 점유율:</span>
                    <span class="stat-val">${me.marketShare} %</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">🏦 금융권 부채:</span>
                    <span class="stat-val" style="color:${me.debt > 0 ? 'var(--accent-red)' : 'var(--text-main)'};">${me.debt.toLocaleString()} 원</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">⚡ 작전권 상태:</span>
                    <span class="stat-val" style="color:${me.actionsLeft > 0 ? 'var(--accent-green)' : 'var(--accent-red)'};">${me.actionsLeft} / 1</span>
                </div>
            `;

            // 작전 버튼 가격 업데이트 (가로 바 형태에 맞춤)
            document.getElementById('advertiseBtn').querySelector('.cost').innerText = `(${(adCost/10000).toLocaleString()}만)`;
            document.getElementById('hireBtn').querySelector('.cost').innerText = `(${(hireCost/10000).toLocaleString()}만)`;

            if (me.actionsLeft <= 0) {
                actionBtnIds.forEach(id => { const btn = document.getElementById(id); if(btn) {btn.disabled = true;} });
            } else {
                actionBtnIds.forEach(id => { const btn = document.getElementById(id); if(btn) {btn.disabled = false;} });
            }
        }
    }

    // 경쟁 기업 리스트 (간단한 칩 형태)
    document.getElementById('playersList').innerHTML = Object.values(room.players)
        .filter(p => p.id !== socket.id)
        .map(p => `<div class="player-chip" style="${p.bankrupt ? 'opacity:0.3; text-decoration:line-through; color:var(--accent-red);' : ''}">
            👤 ${p.nickname} ${!p.bankrupt && p.ready && room.status === 'waiting' ? '<span style="color:var(--accent-green);">[준비]</span>' : ''}
        </div>`).join('') || '<span style="color:var(--text-sub);">다른 CEO를 기다리는 중...</span>';

    // 시가총액 순위 (요청하신 대로 랭킹 + 점유율 표시)
    const active = [...Object.values(room.players), ...room.ais].filter(p => !p.bankrupt).sort((a,b) => b.companyValue - a.companyValue);
    const bankrupt = [...Object.values(room.players), ...room.ais].filter(p => p.bankrupt).sort((a,b) => a.companyValue - b.companyValue);
    
    document.getElementById('rankingList').innerHTML = [...active, ...bankrupt].map((p, idx) => `
        <div class="rank-item ${idx === 0 && !p.bankrupt ? 'rank-1' : ''}" style="${p.bankrupt ? 'opacity:0.5; color:var(--accent-red);' : ''}">
            <div>
                <strong>${idx + 1}.</strong> <span style="${p.bankrupt ? 'text-decoration:line-through;' : ''}">${p.nickname}</span> ${p.bankrupt ? '[파산]' : ''}
            </div>
            <div>
                <span>${p.companyValue.toLocaleString()} 원</span>
                <span class="rank-share">(점유율 ${p.marketShare}%)</span>
            </div>
        </div>
    `).join('');

    // 터미널 로그 업데이트
    document.getElementById('logList').innerHTML = room.logs.map(l => `<div class="log-item">${l}</div>`).join('');
});

socket.on('gameEnded', ({ winner, ranking }) => {
    let msg = `👑 게임 종료! 👑\n최종 승리: [${winner.nickname}]\n최종 가치: ${winner.companyValue.toLocaleString()}원`;
    if (winner.bankrupt) msg = `☠️ 생존자 없음! 전원 파산! ☠️`;
    setTimeout(() => { alert(msg); location.reload(); }, 500);
});
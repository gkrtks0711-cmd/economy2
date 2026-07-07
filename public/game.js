const socket = io();

const loginScreen = document.getElementById('loginScreen');
const gameScreen = document.getElementById('gameScreen');
const nicknameInput = document.getElementById('nickname');
const roomCodeInput = document.getElementById('roomCode');
const actionBtnIds = ['advertiseBtn', 'hireBtn', 'researchBtn', 'foreignBtn', 'loanBtn', 'ipoBtn'];

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
    document.getElementById('readyBtn').innerText = '준비 완료 대기 중...';
    document.getElementById('readyBtn').disabled = true;
};

// ★ 클릭 시 데이터를 보내고 버튼을 즉시 잠가버리는 방어 코드 적용
const actions = [ {id:'advertiseBtn', type:'advertise'}, {id:'hireBtn', type:'hire'}, {id:'researchBtn', type:'research'}, {id:'foreignBtn', type:'foreign'}, {id:'loanBtn', type:'loan'}, {id:'ipoBtn', type:'ipo'} ];
actions.forEach(act => {
    const btn = document.getElementById(act.id);
    if (btn) btn.onclick = () => { 
        if (myRoomCode) {
            socket.emit('action', { roomCode: myRoomCode, actionType: act.type });
        }
    };
});

document.getElementById('copyCodeBtn').onclick = () => {
    if(myRoomCode) navigator.clipboard.writeText(myRoomCode).then(() => alert(`[ ${myRoomCode} ] 방 코드 복사 완료!`)).catch(()=>alert('복사 실패'));
};

document.getElementById('profileBtn').onclick = () => {
    const target = document.getElementById('profileNickname').value.trim();
    if(target) { document.getElementById('profileBox').innerHTML = `<span style="color:#64748b;">검색 중...</span>`; socket.emit('searchProfile', target); }
};

const manualModal = document.getElementById('manualModal');
document.getElementById('openManualLobbyBtn').onclick = () => manualModal.style.display = 'flex';
document.getElementById('openManualGameBtn').onclick = () => manualModal.style.display = 'flex';
document.getElementById('closeManualBtn').onclick = () => manualModal.style.display = 'none';
window.onclick = (event) => { if (event.target === manualModal) manualModal.style.display = 'none'; };

socket.on('errorMessage', (msg) => alert(`[경고]\n${msg}`));

socket.on('profileResult', (data) => {
    const box = document.getElementById('profileBox');
    if (data.error) box.innerHTML = `<span style="color:#f43f5e; font-weight:bold;">${data.error}</span>`;
    else {
        const avg = data.rankCount > 0 ? (data.totalRank / data.rankCount).toFixed(1) : '-';
        const achs = data.achievements && data.achievements.length > 0 ? data.achievements.map(a=>`<li>${a}</li>`).join('') : '<li>없음</li>';
        box.innerHTML = `<p>👤 <strong>${data.nickname}</strong></p><p>🎮 ${data.gamesPlayed}회 | 👑 ${data.wins}회 | 평균 ${avg}위</p><p>📈 최고가치: <span class="value-text">${typeof data.highestValue === 'number' ? data.highestValue.toLocaleString() : data.highestValue}</span></p><div style="margin-top:10px; background:#020617; padding:10px; border-radius:6px; border:1px solid #1e293b;"><strong style="color:#fbbf24;">🎖️ 업적</strong><ul style="margin:5px 0; padding-left:20px;">${achs}</ul></div>`;
    }
});

socket.on('updateRoom', (room) => {
    myRoomCode = room.roomCode;
    if(loginScreen.style.display !== 'none') { loginScreen.style.display = 'none'; gameScreen.style.display = 'block'; }

    document.getElementById('roomCodeDisplay').innerText = myRoomCode;
    document.getElementById('timerDisplay').innerText = room.timeRemaining;
    document.getElementById('roundDisplay').innerText = Math.floor((240 - room.timeRemaining) / 30) + 1;
    document.getElementById('newsBox').innerText = room.news;
    
    const npcShareElem = document.getElementById('npcShareDisplay');
    if (npcShareElem) npcShareElem.innerText = room.npcMarketShare;

    const me = room.players[socket.id];
    if(me) {
        if (me.bankrupt) {
            document.getElementById('myCompany').innerHTML = `<div style="color:#f43f5e; font-size:1.3rem; font-weight:bold; text-align:center; padding: 30px 10px;">☠️ 파산 (GAME OVER)</div>`;
            actionBtnIds.forEach(id => { const btn = document.getElementById(id); if(btn) {btn.disabled = true; btn.style.opacity = '0.3'; btn.style.cursor = 'not-allowed';} });
        } else {
            const adCost = 5000000 + (me.marketShare * 300000);
            const hireCost = 7000000 + (Math.max(0, me.employees - 20) * 300000);
            const expectedProfit = me.marketShare * 500000;
            const expectedSalary = me.employees * 300000;
            const expectedInterest = me.debt * 0.04;
            const netFlow = expectedProfit - expectedSalary - expectedInterest;
            const netColor = netFlow >= 0 ? '#10b981' : '#f43f5e';
            const netSign = netFlow > 0 ? '+' : '';

            document.getElementById('myCompany').innerHTML = `
                <div style="background:rgba(30,41,59,0.5); padding:10px; border-radius:6px; margin-bottom:10px;">
                    <p style="margin:0 0 5px 0;">💰 <strong>보유 현금:</strong> <span class="money-text">${me.cash.toLocaleString()}</span></p>
                    <p style="margin:0; font-size:0.85rem; color:${netColor};">↳ 턴당 예상 현금흐름: ${netSign}${netFlow.toLocaleString()} 원</p>
                </div>
                <p>🏢 <strong>기업 가치:</strong> <span class="value-text">${me.companyValue.toLocaleString()}</span></p>
                <p>👨 <strong>상주 임직원:</strong> <span>${me.employees} 명</span></p>
                <p>⭐ <strong>브랜드 지수:</strong> <span>${me.brand} pt</span></p>
                <p>📊 <strong>시장 점유율:</strong> <span>${me.marketShare} %</span></p>
                <p>🏦 <strong>금융권 부채:</strong> <span class="${me.debt > 0 ? 'debt-text' : ''}">${me.debt.toLocaleString()}</span></p>
                <p>⚡ <strong>작전권:</strong> <span style="color:#f43f5e; font-weight:bold;">${me.actionsLeft} / 1</span></p>
            `;

            document.getElementById('advertiseBtn').innerHTML = `<span class="btn-title">📺 마케팅 (${(adCost/10000).toLocaleString()}만)</span><span class="btn-desc">브랜드+3, 점유율+1%</span>`;
            document.getElementById('hireBtn').innerHTML = `<span class="btn-title">👨 인재 영입 (${(hireCost/10000).toLocaleString()}만)</span><span class="btn-desc">직원 +5명</span>`;

            // ★ 행동권이 0이 되면 모든 버튼을 시각적으로 완전히 잠가버립니다!
            if (me.actionsLeft <= 0) {
                actionBtnIds.forEach(id => { const btn = document.getElementById(id); if(btn) {btn.disabled = true; btn.style.opacity = '0.4'; btn.style.cursor = 'not-allowed';} });
            } else {
                actionBtnIds.forEach(id => { const btn = document.getElementById(id); if(btn) {btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer';} });
            }
        }
    }

    const renderCard = (p) => `<div class="player-card" style="${p.bankrupt ? 'opacity:0.4; border-color:#f43f5e;' : ''}"><div class="card-header"><strong style="${p.bankrupt ? 'text-decoration:line-through; color:#f43f5e;' : ''}">${p.nickname} ${p.bankrupt ? '[파산]' : ''}</strong><span>${!p.bankrupt && p.ready && room.status === 'waiting' ? '<span style="color:#10b981;">[READY]</span>' : ''}</span></div><div class="card-stats"><span>가치: ${p.companyValue.toLocaleString()}</span><span>점유율: ${p.marketShare}%</span></div></div>`;
    document.getElementById('playersList').innerHTML = Object.values(room.players).filter(p => p.id !== socket.id).map(renderCard).join('') || '<div style="color:#475569;">타 서버 연결 대기 중...</div>';
    document.getElementById('aiList').innerHTML = room.ais.map(renderCard).join('');

    const active = [...Object.values(room.players), ...room.ais].filter(p => !p.bankrupt).sort((a,b) => b.companyValue - a.companyValue);
    const bankrupt = [...Object.values(room.players), ...room.ais].filter(p => p.bankrupt).sort((a,b) => a.companyValue - b.companyValue);
    document.getElementById('rankingList').innerHTML = [...active, ...bankrupt].map((p, idx) => `<div class="rank-item ${idx < 3 && !p.bankrupt ? 'rank-' + (idx+1) : ''}" style="${p.bankrupt ? 'color:#f43f5e; opacity:0.6;' : ''}"><span style="${p.bankrupt ? 'text-decoration:line-through;' : ''}">${idx + 1}. ${p.nickname} ${p.bankrupt ? '[파산]' : ''}</span><span>${p.companyValue.toLocaleString()}</span></div>`).join('');
    document.getElementById('logList').innerHTML = room.logs.map(l => `<div class="log-item">${l}</div>`).join('');
});

socket.on('gameEnded', ({ winner, ranking }) => {
    let msg = `👑 게임 종료! 👑\n최종 승리: [${winner.nickname}]\n가치: ${winner.companyValue.toLocaleString()}원`;
    if (winner.bankrupt) msg = `☠️ 생존자 없음! 전원 파산! ☠️`;
    alert(msg); location.reload();
});
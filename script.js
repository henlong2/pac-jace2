document.addEventListener('DOMContentLoaded', () => {
    // 1. 상수 관리 강화
    const ELEMENTS = {
        player: document.getElementById('player'),
        catcher: document.getElementById('catcher'),
        gameArea: document.querySelector('.game-area'),
        startButton: document.getElementById('start-button'),
        gameMessage: document.getElementById('game-message'),
        caughtCountSpan: document.getElementById('caught-count'),
        timeElapsedSpan: document.getElementById('time-elapsed'),
        levelSpan: document.getElementById('level')
    };

    const GAME_SETTINGS = {
        PLAYER_SIZE: 30,
        CATCHER_SIZE: 30,
        FOOD_SIZE: 20,
        GRID_CELL_SIZE: 30, // 캐릭터 크기와 같게 설정하면 좋음
        CATCHER_SPEED: 4.5,
        PATH_RECALC_INTERVAL_FRAMES: 3, // 20ms * 3 = 60ms
        STUCK_THRESHOLD_FRAMES: 30, // 0.6초 (20ms * 30) 이상 같은 위치에 있으면 막힌 것으로 간주
        MIN_OBSTACLES: 5,
        MAX_OBSTACLES: 15,
        MIN_OBS_SIZE: 30,
        MAX_OBS_SIZE: 100,
        MAP_GENERATION_MAX_ATTEMPTS: 50, // 유효한 맵 생성 시도 횟수 제한
        GAME_LOOP_INTERVAL_MS: 20, // 50 FPS
        LEVEL_UP_DELAY_MS: 1000, // 1초
        CORNER_PADDING: 10 // 벽으로부터의 여백
    };

    // 4. 게임 상태 관리를 위한 객체 활용
    const GAME_STATE = {
        RUNNING: 'running',
        PAUSED: 'paused',
        ENDED: 'ended',
        INITIAL: 'initial'
    };
    let currentGameState = GAME_STATE.INITIAL;

    let obstacles = [];
    let food = null;

    let gameAreaRect;
    let playerX, playerY;
    let catcherX, catcherY;
    let foodX, foodY;
    let gameLoopInterval;
    let caughtCount = 0;
    let timeElapsed = 0;
    let currentLevel = 1;
    let catcherPath = []; // 술래의 현재 경로
    let frameCount = 0;
    let stuckCounter = 0;
    let lastCatcherX, lastCatcherY;

    // 게임 초기화 (새 레벨 진입 시에도 호출)
    function initializeGame(isNewLevel = false) {
        gameAreaRect = ELEMENTS.gameArea.getBoundingClientRect();

        // 기존 요소들 제거
        obstacles.forEach(obs => obs.remove());
        obstacles = [];
        if (food) food.remove();
        food = null;

        let attemptsToGenerateMap = 0;

        do {
            obstacles.forEach(obs => obs.remove());
            obstacles = [];
            if (food) food.remove();
            food = null;

            generateRandomObstacles(); // 무작위 장애물 생성

            // 먹이 아이템 생성 (장애물과 겹치지 않게)
            [foodX, foodY] = getRandomValidPosition(GAME_SETTINGS.FOOD_SIZE, obstacles, []);
            food = document.createElement('div');
            food.classList.add('food');
            food.style.width = `${GAME_SETTINGS.FOOD_SIZE}px`;
            food.style.height = `${GAME_SETTINGS.FOOD_SIZE}px`;
            food.style.borderRadius = '50%';
            updateCharacterPosition(food, foodX, foodY);
            ELEMENTS.gameArea.appendChild(food);

            // 플레이어와 술래의 코너 위치 무작위 설정
            const cornerPositions = getCornerPositions(GAME_SETTINGS.PLAYER_SIZE);
            let playerCornerIndex = Math.floor(Math.random() * cornerPositions.length);
            let catcherCornerIndex;
            do {
                catcherCornerIndex = Math.floor(Math.random() * cornerPositions.length);
            } while (catcherCornerIndex === playerCornerIndex);

            [playerX, playerY] = cornerPositions[playerCornerIndex];
            [catcherX, catcherY] = cornerPositions[catcherCornerIndex];

            attemptsToGenerateMap++;
            // 현재 생성된 맵에서 술래->플레이어, 술래->먹이, 플레이어->먹이 경로가 모두 가능한지 검사
        } while (
            (!findPath(
                Math.floor((catcherX + GAME_SETTINGS.CATCHER_SIZE / 2) / GAME_SETTINGS.GRID_CELL_SIZE),
                Math.floor((catcherY + GAME_SETTINGS.CATCHER_SIZE / 2) / GAME_SETTINGS.GRID_CELL_SIZE),
                Math.floor((playerX + GAME_SETTINGS.PLAYER_SIZE / 2) / GAME_SETTINGS.GRID_CELL_SIZE),
                Math.floor((playerY + GAME_SETTINGS.PLAYER_SIZE / 2) / GAME_SETTINGS.GRID_CELL_SIZE)
            ).length ||
            !findPath(
                Math.floor((catcherX + GAME_SETTINGS.CATCHER_SIZE / 2) / GAME_SETTINGS.GRID_CELL_SIZE),
                Math.floor((catcherY + GAME_SETTINGS.CATCHER_SIZE / 2) / GAME_SETTINGS.GRID_CELL_SIZE),
                Math.floor((foodX + GAME_SETTINGS.FOOD_SIZE / 2) / GAME_SETTINGS.GRID_CELL_SIZE),
                Math.floor((foodY + GAME_SETTINGS.FOOD_SIZE / 2) / GAME_SETTINGS.GRID_CELL_SIZE)
            ).length ||
            !findPath(
                Math.floor((playerX + GAME_SETTINGS.PLAYER_SIZE / 2) / GAME_SETTINGS.GRID_CELL_SIZE),
                Math.floor((playerY + GAME_SETTINGS.PLAYER_SIZE / 2) / GAME_SETTINGS.GRID_CELL_SIZE),
                Math.floor((foodX + GAME_SETTINGS.FOOD_SIZE / 2) / GAME_SETTINGS.GRID_CELL_SIZE),
                Math.floor((foodY + GAME_SETTINGS.FOOD_SIZE / 2) / GAME_SETTINGS.GRID_CELL_SIZE)
            ).length) && attemptsToGenerateMap < GAME_SETTINGS.MAP_GENERATION_MAX_ATTEMPTS
        );

        // 맵 생성 실패 시 처리
        if (attemptsToGenerateMap >= GAME_SETTINGS.MAP_GENERATION_MAX_ATTEMPTS) {
            console.warn("맵 생성에 실패했습니다: 유효한 경로를 찾을 수 없습니다. 다시 시도해주세요.");
            alert("맵 생성에 문제가 발생했습니다. '게임 시작' 버튼을 다시 눌러주세요.");
            ELEMENTS.startButton.disabled = false;
            return;
        }

        // 캐릭터 위치 업데이트
        updateCharacterPosition(ELEMENTS.player, playerX, playerY);
        updateCharacterPosition(ELEMENTS.catcher, catcherX, catcherY);

        // 게임 정보 초기화/업데이트
        caughtCount = 0;
        timeElapsed = 0;
        ELEMENTS.caughtCountSpan.textContent = caughtCount;
        ELEMENTS.timeElapsedSpan.textContent = timeElapsed;
        ELEMENTS.levelSpan.textContent = currentLevel;
        ELEMENTS.gameMessage.textContent = isNewLevel ? `레벨 ${currentLevel} 시작!` : '게임을 시작하세요!';
        ELEMENTS.startButton.disabled = false;
        currentGameState = GAME_STATE.INITIAL; // 상태 초기화
        clearInterval(gameLoopInterval);
        catcherPath = [];
    }

    // 게임 영역 네 모서리 위치 반환 함수
    function getCornerPositions(charSize) {
        const padding = GAME_SETTINGS.CORNER_PADDING;
        return [
            [padding, padding],
            [gameAreaRect.width - charSize - padding, padding],
            [padding, gameAreaRect.height - charSize - padding],
            [gameAreaRect.width - charSize - padding, gameAreaRect.height - charSize - padding]
        ];
    }

    // 무작위 원형 장애물 생성 함수
    function generateRandomObstacles() {
        const numObstacles = Math.floor(Math.random() * (GAME_SETTINGS.MAX_OBSTACLES - GAME_SETTINGS.MIN_OBSTACLES + 1)) + GAME_SETTINGS.MIN_OBSTACLES;

        for (let i = 0; i < numObstacles; i++) {
            let obsX, obsY, obsSize;
            let isOverlapping = true;
            let attempts = 0;
            const maxAttemptsPerObstacle = 100;

            while (isOverlapping && attempts < maxAttemptsPerObstacle) {
                obsSize = Math.floor(Math.random() * (GAME_SETTINGS.MAX_OBS_SIZE - GAME_SETTINGS.MIN_OBS_SIZE + 1)) + GAME_SETTINGS.MIN_OBS_SIZE;
                obsX = Math.random() * (gameAreaRect.width - obsSize);
                obsY = Math.random() * (gameAreaRect.height - obsSize);

                const newObstacleRect = {
                    left: obsX, top: obsY,
                    right: obsX + obsSize, bottom: obsY + obsSize
                };

                isOverlapping = false;
                obstacles.forEach(existingObs => {
                    const existingObsRect = {
                        left: parseFloat(existingObs.style.left),
                        top: parseFloat(existingObs.style.top),
                        right: parseFloat(existingObs.style.left) + parseFloat(existingObs.style.width),
                        bottom: parseFloat(existingObs.style.top) + parseFloat(existingObs.style.height)
                    };
                    if (isColliding(newObstacleRect, existingObsRect)) {
                        isOverlapping = true;
                    }
                });

                attempts++;
            }

            if (!isOverlapping) {
                const obstacleDiv = document.createElement('div');
                obstacleDiv.classList.add('obstacle');
                obstacleDiv.style.left = `${obsX}px`;
                obstacleDiv.style.top = `${obsY}px`;
                obstacleDiv.style.width = `${obsSize}px`;
                obstacleDiv.style.height = `${obsSize}px`;
                obstacleDiv.style.borderRadius = '50%';
                ELEMENTS.gameArea.appendChild(obstacleDiv);
                obstacles.push(obstacleDiv);
            }
        }
    }

    // 요소의 위치를 업데이트하는 범용 함수
    function updateCharacterPosition(charElement, x, y) {
        charElement.style.left = `${x}px`;
        charElement.style.top = `${y}px`;
    }

    // 두 사각형이 겹치는지 확인하는 함수
    function isColliding(rect1, rect2) {
        return rect1.left < rect2.right &&
               rect1.right > rect2.left &&
               rect1.top < rect2.bottom &&
               rect1.bottom > rect2.top;
    }

    // 장애물과의 충돌을 조정하여 이동을 제한하는 함수
    function adjustForObstacleCollision(currentX, currentY, newX, newY, charSize) {
        let adjustedX = newX;
        let adjustedY = newY;

        let testRectX = {
            left: newX, top: currentY,
            right: newX + charSize, bottom: currentY + charSize
        };
        obstacles.forEach(obstacle => {
            const obsRectInGameArea = {
                left: parseFloat(obstacle.style.left),
                top: parseFloat(obstacle.style.top),
                right: parseFloat(obstacle.style.left) + parseFloat(obstacle.style.width),
                bottom: parseFloat(obstacle.style.top) + parseFloat(obstacle.style.height)
            };
            if (isColliding(testRectX, obsRectInGameArea)) {
                adjustedX = currentX;
            }
        });

        let testRectY = {
            left: adjustedX, top: newY,
            right: adjustedX + charSize, bottom: newY + charSize
        };
        obstacles.forEach(obstacle => {
             const obsRectInGameArea = {
                left: parseFloat(obstacle.style.left),
                top: parseFloat(obstacle.style.top),
                right: parseFloat(obstacle.style.left) + parseFloat(obstacle.style.width),
                bottom: parseFloat(obstacle.style.top) + parseFloat(obstacle.style.height)
            };
            if (isColliding(testRectY, obsRectInGameArea)) {
                adjustedY = currentY;
            }
        });
        return { x: adjustedX, y: adjustedY };
    }

    // 플레이어 마우스 이동 이벤트
    ELEMENTS.gameArea.addEventListener('mousemove', (e) => {
        if (currentGameState !== GAME_STATE.RUNNING) return;
        e.preventDefault(); // 기본 마우스 동작 (텍스트 선택 등) 방지

        const mouseX = e.clientX - gameAreaRect.left;
        const mouseY = e.clientY - gameAreaRect.top;

        let newPlayerX = Math.max(0, Math.min(mouseX - GAME_SETTINGS.PLAYER_SIZE / 2, gameAreaRect.width - GAME_SETTINGS.PLAYER_SIZE));
        let newPlayerY = Math.max(0, Math.min(mouseY - GAME_SETTINGS.PLAYER_SIZE / 2, gameAreaRect.height - GAME_SETTINGS.PLAYER_SIZE));

        const adjustedPos = adjustForObstacleCollision(playerX, playerY, newPlayerX, newPlayerY, GAME_SETTINGS.PLAYER_SIZE);
        playerX = adjustedPos.x;
        playerY = adjustedPos.y;

        updateCharacterPosition(ELEMENTS.player, playerX, playerY);
        checkFoodCollision();
    });

    // 플레이어 터치 이동 이벤트 (모바일)
    ELEMENTS.gameArea.addEventListener('touchmove', (e) => {
        if (currentGameState !== GAME_STATE.RUNNING) return;
        e.preventDefault(); // 모바일에서 스크롤 방지

        // 최소 하나의 터치 포인트가 있는지 확인
        if (e.touches.length > 0) {
            const touchX = e.touches[0].clientX - gameAreaRect.left;
            const touchY = e.touches[0].clientY - gameAreaRect.top;

            let newPlayerX = Math.max(0, Math.min(touchX - GAME_SETTINGS.PLAYER_SIZE / 2, gameAreaRect.width - GAME_SETTINGS.PLAYER_SIZE));
            let newPlayerY = Math.max(0, Math.min(touchY - GAME_SETTINGS.PLAYER_SIZE / 2, gameAreaRect.height - GAME_SETTINGS.PLAYER_SIZE));

            const adjustedPos = adjustForObstacleCollision(playerX, playerY, newPlayerX, newPlayerY, GAME_SETTINGS.PLAYER_SIZE);
            playerX = adjustedPos.x;
            playerY = adjustedPos.y;

            updateCharacterPosition(ELEMENTS.player, playerX, playerY);
            checkFoodCollision();
        }
    });


    // 술래 이동 로직
    function moveCatcher() {
        const speed = GAME_SETTINGS.CATCHER_SPEED;

        if (typeof lastCatcherX === 'undefined' || currentGameState !== GAME_STATE.RUNNING) {
            lastCatcherX = catcherX;
            lastCatcherY = catcherY;
        }

        frameCount++;
        if (frameCount % GAME_SETTINGS.PATH_RECALC_INTERVAL_FRAMES === 0) {
            catcherPath = findPath(
                Math.floor((catcherX + GAME_SETTINGS.CATCHER_SIZE / 2) / GAME_SETTINGS.GRID_CELL_SIZE),
                Math.floor((catcherY + GAME_SETTINGS.CATCHER_SIZE / 2) / GAME_SETTINGS.GRID_CELL_SIZE),
                Math.floor((playerX + GAME_SETTINGS.PLAYER_SIZE / 2) / GAME_SETTINGS.GRID_CELL_SIZE),
                Math.floor((playerY + GAME_SETTINGS.PLAYER_SIZE / 2) / GAME_SETTINGS.GRID_CELL_SIZE)
            );
        }

        let currentMoveAttemptX = catcherX;
        let currentMoveAttemptY = catcherY;

        if (catcherPath.length > 0) {
            const nextCell = catcherPath[0];
            const targetX = nextCell.x * GAME_SETTINGS.GRID_CELL_SIZE + (GAME_SETTINGS.GRID_CELL_SIZE / 2) - (GAME_SETTINGS.CATCHER_SIZE / 2);
            const targetY = nextCell.y * GAME_SETTINGS.GRID_CELL_SIZE + (GAME_SETTINGS.GRID_CELL_SIZE / 2) - (GAME_SETTINGS.CATCHER_SIZE / 2);

            let dx = targetX - catcherX;
            let dy = targetY - catcherY;
            const distToTarget = Math.sqrt(dx * dx + dy * dy);

            if (distToTarget < (speed * 0.8) && distToTarget < (GAME_SETTINGS.GRID_CELL_SIZE * 0.5)) {
                currentMoveAttemptX = targetX;
                currentMoveAttemptY = targetY;
                catcherPath.shift();
            } else {
                dx = dx / distToTarget;
                dy = dy / distToTarget;
                currentMoveAttemptX = catcherX + dx * speed;
                currentMoveAttemptY = catcherY + dy * speed;
            }
        } else {
            const playerCenterX = playerX + GAME_SETTINGS.PLAYER_SIZE / 2;
            const playerCenterY = playerY + GAME_SETTINGS.PLAYER_SIZE / 2;
            const catcherCenterX = catcherX + GAME_SETTINGS.CATCHER_SIZE / 2;
            const catcherCenterY = catcherY + GAME_SETTINGS.CATCHER_SIZE / 2;

            let dx = playerCenterX - catcherCenterX;
            let dy = playerCenterY - catcherCenterY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > 0) {
                dx = dx / distance;
                dy = dy / distance;
            }
            currentMoveAttemptX = catcherX + dx * speed;
            currentMoveAttemptY = catcherY + dy * speed;
        }

        currentMoveAttemptX = Math.max(0, Math.min(currentMoveAttemptX, gameAreaRect.width - GAME_SETTINGS.CATCHER_SIZE));
        currentMoveAttemptY = Math.max(0, Math.min(currentMoveAttemptY, gameAreaRect.height - GAME_SETTINGS.CATCHER_SIZE));

        const adjustedPos = adjustForObstacleCollision(catcherX, catcherY, currentMoveAttemptX, currentMoveAttemptY, GAME_SETTINGS.CATCHER_SIZE);
        const prevCatcherX = catcherX;
        const prevCatcherY = catcherY;
        catcherX = adjustedPos.x;
        catcherY = adjustedPos.y;

        const movedDistance = Math.sqrt(Math.pow(catcherX - prevCatcherX, 2) + Math.pow(catcherY - prevCatcherY, 2));
        if (movedDistance < 0.5) {
            stuckCounter++;
        } else {
            stuckCounter = 0;
        }

        // 술래가 일정 시간 이상 막혔다면, 경로를 강제로 다시 계산하고 주변을 탐색하도록 시도
        if (stuckCounter > GAME_SETTINGS.STUCK_THRESHOLD_FRAMES) {
            console.log("Catcher stuck! Re-calculating path and trying to un-stuck.");
            stuckCounter = 0;

            catcherX += (Math.random() - 0.5) * (speed * 0.5);
            catcherY += (Math.random() - 0.5) * (speed * 0.5);

            catcherX = Math.max(0, Math.min(catcherX, gameAreaRect.width - GAME_SETTINGS.CATCHER_SIZE));
            catcherY = Math.max(0, Math.min(catcherY, gameAreaRect.height - GAME_SETTINGS.CATCHER_SIZE));

            catcherPath = findPath(
                Math.floor((catcherX + GAME_SETTINGS.CATCHER_SIZE / 2) / GAME_SETTINGS.GRID_CELL_SIZE),
                Math.floor((catcherY + GAME_SETTINGS.CATCHER_SIZE / 2) / GAME_SETTINGS.GRID_CELL_SIZE),
                Math.floor((playerX + GAME_SETTINGS.PLAYER_SIZE / 2) / GAME_SETTINGS.GRID_CELL_SIZE),
                Math.floor((playerY + GAME_SETTINGS.PLAYER_SIZE / 2) / GAME_SETTINGS.GRID_CELL_SIZE)
            );
        }

        lastCatcherX = catcherX;
        lastCatcherY = catcherY;

        updateCharacterPosition(ELEMENTS.catcher, catcherX, catcherY);
        checkPlayerCatcherCollision();
    }

    // BFS를 이용한 최단 경로 탐색 함수
    function findPath(startX, startY, targetX, targetY) {
        const cols = Math.floor(gameAreaRect.width / GAME_SETTINGS.GRID_CELL_SIZE);
        const rows = Math.floor(gameAreaRect.height / GAME_SETTINGS.GRID_CELL_SIZE);

        const grid = Array(rows).fill(0).map(() => Array(cols).fill(0));
        obstacles.forEach(obstacle => {
            const obsLeft = parseFloat(obstacle.style.left);
            const obsTop = parseFloat(obstacle.style.top);
            const obsWidth = parseFloat(obstacle.style.width);
            const obsHeight = parseFloat(obstacle.style.height);

            const obsGridLeft = Math.floor(obsLeft / GAME_SETTINGS.GRID_CELL_SIZE);
            const obsGridTop = Math.floor(obsTop / GAME_SETTINGS.GRID_CELL_SIZE);
            const obsGridRight = Math.ceil((obsLeft + obsWidth) / GAME_SETTINGS.GRID_CELL_SIZE);
            const obsGridBottom = Math.ceil((obsTop + obsHeight) / GAME_SETTINGS.GRID_CELL_SIZE);

            for (let r = Math.max(0, obsGridTop); r < Math.min(rows, obsGridBottom); r++) {
                for (let c = Math.max(0, obsGridLeft); c < Math.min(cols, obsGridRight); c++) {
                    grid[r][c] = 1; // 1은 장애물이 있는 셀
                }
            }
        });

        if (startX < 0 || startX >= cols || startY < 0 || startY >= rows || grid[startY][startX] === 1) return [];
        if (targetX < 0 || targetX >= cols || targetY < 0 || targetY >= rows || grid[targetY][targetX] === 1) {
            return [];
        }

        const queue = [{ x: startX, y: startY, path: [] }];
        const visited = new Set();
        visited.add(`${startX},${startY}`);

        const directions = [
            { dx: 0, dy: -1 }, // 상
            { dx: 0, dy: 1 },  // 하
            { dx: -1, dy: 0 }, // 좌
            { dx: 1, dy: 0 },  // 우
        ];

        while (queue.length > 0) {
            const { x, y, path } = queue.shift();

            if (x === targetX && y === targetY) {
                return path;
            }

            for (const dir of directions) {
                const newX = x + dir.dx;
                const newY = y + dir.dy;

                if (newX >= 0 && newX < cols && newY >= 0 && newY < rows &&
                    grid[newY][newX] === 0 && !visited.has(`${newX},${newY}`)) {

                    visited.add(`${newX},${newY}`);
                    queue.push({ x: newX, y: newY, path: [...path, { x: newX, y: newY }] });
                }
            }
        }
        return [];
    }

    // 플레이어와 술래 충돌 감지 함수
    function checkPlayerCatcherCollision() {
        const playerRect = {
            left: playerX,
            top: playerY,
            right: playerX + GAME_SETTINGS.PLAYER_SIZE,
            bottom: playerY + GAME_SETTINGS.PLAYER_SIZE
        };
        const catcherRect = {
            left: catcherX,
            top: catcherY,
            right: catcherX + GAME_SETTINGS.CATCHER_SIZE,
            bottom: catcherY + GAME_SETTINGS.CATCHER_SIZE
        };

        if (isColliding(playerRect, catcherRect)) {
            caughtCount++;
            ELEMENTS.caughtCountSpan.textContent = caughtCount;
            ELEMENTS.gameMessage.textContent = `앗! ${caughtCount}번 잡혔어요!`;
            endGame();
        }
    }

    // 플레이어와 먹이 충돌 감지 및 레벨업 함수
    function checkFoodCollision() {
        if (!food) return;

        const playerRect = {
            left: playerX,
            top: playerY,
            right: playerX + GAME_SETTINGS.PLAYER_SIZE,
            bottom: playerY + GAME_SETTINGS.PLAYER_SIZE
        };
        const foodRect = {
            left: foodX,
            top: foodY,
            right: foodX + GAME_SETTINGS.FOOD_SIZE,
            bottom: foodY + GAME_SETTINGS.FOOD_SIZE
        };

        if (isColliding(playerRect, foodRect)) {
            food.remove();
            food = null;
            currentLevel++;
            ELEMENTS.gameMessage.textContent = `레벨 ${currentLevel}로 이동!`;
            clearInterval(gameLoopInterval);
            currentGameState = GAME_STATE.PAUSED; // 레벨업 시 잠시 중지 상태
            ELEMENTS.startButton.disabled = false;

            setTimeout(() => {
                initializeGame(true);
                // 재활성화된 시작 버튼을 자동으로 클릭하여 다음 레벨 시작
                if (currentGameState === GAME_STATE.INITIAL) { // 초기 상태일 때만 자동 시작
                    startGame();
                }
            }, GAME_SETTINGS.LEVEL_UP_DELAY_MS);
        }
    }

    // 무작위 유효 위치 반환 함수
    function getRandomValidPosition(charSize, existingObstacles, excludedPositions = []) {
        let x, y;
        let isOverlapping = true;
        let maxAttempts = 200;

        while (isOverlapping && maxAttempts > 0) {
            x = Math.random() * (gameAreaRect.width - charSize);
            y = Math.random() * (gameAreaRect.height - charSize);

            const testRect = {
                left: x, top: y,
                right: x + charSize, bottom: y + charSize
            };

            isOverlapping = false;

            for (const obstacle of existingObstacles) {
                 const obstacleRect = {
                    left: parseFloat(obstacle.style.left),
                    top: parseFloat(obstacle.style.top),
                    right: parseFloat(obstacle.style.left) + parseFloat(obstacle.style.width),
                    bottom: parseFloat(obstacle.style.top) + parseFloat(obstacle.style.height)
                };
                if (isColliding(testRect, obstacleRect)) {
                    isOverlapping = true;
                    break;
                }
            }

            if (!isOverlapping && excludedPositions.length > 0) {
                for (let i = 0; i < excludedPositions.length; i += 2) {
                    const excludedX = excludedPositions[i];
                    const excludedY = excludedPositions[i+1];
                    const excludedRect = {
                        left: excludedX, top: excludedY,
                        right: excludedX + GAME_SETTINGS.PLAYER_SIZE,
                        bottom: excludedY + GAME_SETTINGS.PLAYER_SIZE
                    };
                    if (isColliding(testRect, excludedRect)) {
                        isOverlapping = true;
                        break;
                    }
                }
            }
            maxAttempts--;
        }
        if (maxAttempts === 0) {
            console.warn("Failed to find non-overlapping position after many attempts. Placing in center as fallback.");
            return [(gameAreaRect.width / 2) - (charSize / 2), (gameAreaRect.height / 2) - (charSize / 2)];
        }
        return [x, y];
    }

    // 게임 시작 함수
    function startGame() {
        if (currentGameState === GAME_STATE.RUNNING) return;

        // initializeGame는 startGame 전에 호출되거나, 첫 시작 시에는 initializeGame에서 초기 레벨 설정을 하므로
        // startGame에서는 레벨 초기화를 하지 않습니다. 레벨업 시 initializeGame에서 처리됩니다.
        if (currentGameState === GAME_STATE.INITIAL) {
             currentLevel = 1;
             initializeGame(false);
        }


        currentGameState = GAME_STATE.RUNNING;
        ELEMENTS.startButton.disabled = true;
        ELEMENTS.gameMessage.textContent = '술래를 피하고 먹이를 잡으세요!';

        gameLoopInterval = setInterval(() => {
            moveCatcher();
            timeElapsed++;
            ELEMENTS.timeElapsedSpan.textContent = timeElapsed;
        }, GAME_SETTINGS.GAME_LOOP_INTERVAL_MS);
    }

    // 게임 종료 함수
    function endGame() {
        currentGameState = GAME_STATE.ENDED;
        clearInterval(gameLoopInterval);
        ELEMENTS.startButton.disabled = false;
        ELEMENTS.gameMessage.textContent = `게임 종료! ${caughtCount}번 잡혔습니다. 최종 레벨: ${currentLevel}. 다시 시작하려면 '게임 시작' 버튼을 누르세요.`;
    }

    ELEMENTS.startButton.addEventListener('click', startGame);
    // 게임 영역을 터치하여 게임 시작 (모바일 지원)
    ELEMENTS.gameArea.addEventListener('touchstart', startGame);


    initializeGame(); // 페이지 로드 시 초기 게임 설정 (게임 시작 전 상태)

    // 창 크기 변경 시 게임 초기화 (게임 중이 아닐 때만)
    window.addEventListener('resize', () => {
        // 게임이 종료되었거나, 아직 시작하지 않은 상태에서만 리셋
        if (currentGameState === GAME_STATE.ENDED || currentGameState === GAME_STATE.INITIAL) {
            initializeGame();
        } else if (currentGameState === GAME_STATE.RUNNING || currentGameState === GAME_STATE.PAUSED) {
            // 게임 중일 때는 게임 영역 크기만 업데이트하고 맵은 유지 (성능상 이유)
            gameAreaRect = ELEMENTS.gameArea.getBoundingClientRect();
            // 필요하다면 이 지점에서 캐릭터 위치를 새 영역에 맞게 조정하는 로직 추가 가능
        }
    });
});
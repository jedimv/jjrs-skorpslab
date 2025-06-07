import { toAug, room, players, PlayerAugmented, Game } from "../index";
import { sendMessage } from "./message";
import { freeKick, penalty } from "./out";
import { handleLastTouch } from "./offside";
import { defaults, mapBounds } from "./settings";
import { sleep } from "./utils";
import { isPenalty } from "./foul";

// ajustes pra fazer: remover o carrinho dar esse salto, transformar em um "bote":
// o jogador se acertar a bola vai *empurrar* o jogador, e paralizar a bola pra conseguir sair em dominio, ou somente cortar
// caso acerte o jogador, será marcado falta
// além de empurrar em certas situações o goleiro marcar falta automaticamente

export const checkAllX = (game: Game) => {
  players.filter(p => p.team != 0).forEach(pp => {
    const props = room.getPlayerDiscProperties(pp.id);
    if (!props) return;

    // Se X foi pressionado (um toque)
    if (props.damping == defaults.kickingDamping && !pp.tackled) {
      pp.tackled = true;
      tackle(game, pp);
    }

    // Libera o botão X para detectar novo toque
    if (props.damping != defaults.kickingDamping) {
      pp.tackled = false;
    }
  });
};

const tackle = async (game: Game, p: PlayerAugmented) => {
  if (p.slowdown) return;
  if (game.animation) {
    room.setPlayerAvatar(p.id, "");
    return;
  }

  const myDisc = room.getPlayerDiscProperties(p.id);
  if (!myDisc) return;

  if (p.cooldownUntil > new Date().getTime()) {
    sendMessage(
      `Cooldown: ${Math.ceil((p.cooldownUntil - new Date().getTime()) / 1000)}s`,
      p,
    );
    p.activation = 0;
    room.setPlayerAvatar(p.id, "🚫");
    setTimeout(() => room.setPlayerAvatar(p.id, ""), 200);
    return;
  }

  // verifica colisão com a bola
  // const ball = room.getDiscProperties(0);
  // if (ball) {
  //   const dxBall = ball.x - myDisc.x;
  //   const dyBall = ball.y - myDisc.y;
  //   const distBall = Math.sqrt(dxBall * dxBall + dyBall * dyBall);
  //   const ballHitThreshold = 30; // ajuste o valor conforme necessário

  //   const lastTouchPlayer = game.lastTouch?.byPlayer;

  //   if (lastTouchPlayer && lastTouchPlayer.id !== p.id) {
  //     // jogador deu o bote e a bola tinha dono antes => possível roubo
  //     room.setDiscProperties(0, { xspeed: 0, yspeed: 0, xgravity: 0, ygravity: 0 });

  //     // para cada jogador próximo à bola, empurre-o
  //     const pushRadius = 120; // raio de influência ao redor da bola
  //     for (const other of players) {
  //       if (other.id === p.id) continue; // ignora o próprio jogador
  //       const otherDisc = room.getPlayerDiscProperties(other.id);
  //       if (!otherDisc) continue;
  //       const dxOther = otherDisc.x - ball.x;
  //       const dyOther = otherDisc.y - ball.y;
  //       const distOther = Math.sqrt(dxOther * dxOther + dyOther * dyOther);
  //       if (distOther < pushRadius) {
  //         // Aplica força de empurrão
  //         const magnitude = distOther || 1;
  //         const pushForce = 4.5; // ajuste o valor conforme necessário
  //         room.setPlayerDiscProperties(other.id, {
  //           xspeed: (dxOther / magnitude) * pushForce,
  //           yspeed: (dyOther / magnitude) * pushForce,
  //         });
  //       }
  //     }

  //     // Para que o player consiga retomar o controle, "paralisa" a bola por 500ms
  //     setTimeout(() => {
  //       // Aqui, você pode restaurar os valores de gravidade padrão.
  //       // Se tiver valores default definidos (ex.: defaults.ballXGravity, defaults.ballYGravity), use-os:
  //       room.setDiscProperties(0, { xgravity: 0, ygravity: 0 });
  //     }, 500);

  //     room.setPlayerAvatar(p.id, "⚽"); // indica que o tackle impactou a bola
  //     setTimeout(() => room.setPlayerAvatar(p.id, ""), 400);

  //     // Define o cooldown e outros parâmetros do jogador
  //     p.cooldownUntil = new Date().getTime() + 23000;
  //     p.slowdown = 0.13;
  //     p.slowdownUntil = new Date().getTime() + 3000;
  //     p.activation = 0;
  //     return;
  //   }
  // }
  /*//*/

  

  // Se não houve colisão com a bola, procura por adversário
  const ballPos = room.getDiscProperties(0);
  let closestOpponent: PlayerAugmented | null = null;
  let minDist = 9999;
  const opponentHitThreshold = 35;

  for (const other of players) {
    //if (other.team === 0 || other.team === p.team) continue; // ignora espectadores e companheiros
    if (other.team === 0) continue; // ideia é permitir o fogo amigo

    const otherDisc = room.getPlayerDiscProperties(other.id);
    if (!otherDisc) continue;

    const dx = otherDisc.x - ballPos.x;
    const dy = otherDisc.y - ballPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < opponentHitThreshold && dist < minDist) {
      closestOpponent = other;
      minDist = dist;
    }
  }

  if (closestOpponent) {
    const victimDisc = room.getPlayerDiscProperties(closestOpponent.id);
    if (!victimDisc) return;

    // Calcula o vetor de empurrão
    const dx = victimDisc.x - myDisc.x;
    const dy = victimDisc.y - myDisc.y;
    const magnitude = Math.sqrt(dx * dx + dy * dy) || 1;
    const pushForce = 4.5; // ajuste do empurrão
    const pushX = (dx / magnitude) * pushForce;
    const pushY = (dy / magnitude) * pushForce;

    room.setPlayerDiscProperties(closestOpponent.id, {
      xspeed: pushX,
      yspeed: pushY,
    });

    room.setPlayerAvatar(p.id, "💥"); // indica que o tackle atingiu um adversário
    setTimeout(() => room.setPlayerAvatar(p.id, ""), 400);

    // Marcar falta – caso deseje acionar alguma lógica de falta:
    sendMessage(`${p.name} cometeu falta ao empurrar ${closestOpponent.name}!`);

    p.cooldownUntil = new Date().getTime() + 23000;
    p.slowdown = 0.13;
    p.slowdownUntil = new Date().getTime() + 3000;
    p.activation = 0;
  } else {
    sendMessage("Nenhum adversário próximo para empurrar.", p);
    room.setPlayerAvatar(p.id, "❌");
    setTimeout(() => room.setPlayerAvatar(p.id, ""), 300);
    p.activation = 0;
  }
};




// não pretendo ter sprint no momento
// export const sprint = (game: Game, p: PlayerAugmented) => {
//   if (p.slowdown) {
//     return;
//   }
//   const props = room.getPlayerDiscProperties(p.id);
//   const magnitude = Math.sqrt(props.xspeed ** 2 + props.yspeed ** 2);
//   const vecX = props.xspeed / magnitude;
//   const vecY = props.yspeed / magnitude;
//   room.setPlayerDiscProperties(p.id, {
//     xgravity: vecX * 0.08,
//     ygravity: vecY * 0.08,
//   });
//   setTimeout(
//     () => room.setPlayerDiscProperties(p.id, { xgravity: 0, ygravity: 0 }),
//     1000,
//   );
// };
/*//*/

// inverter o slide para um tackle, seria um "empurrão" basicamente
// const slide = async (game: Game, p: PlayerAugmented) => {
//   if (p.slowdown) {
//     return;
//   }
//   if (game.animation) {
//     room.setPlayerAvatar(p.id, "");
//     return;
//   }
//   const props = room.getPlayerDiscProperties(p.id);
//   if (p.cooldownUntil > new Date().getTime()) {
//     sendMessage(
//       `Cooldown: ${Math.ceil((p.cooldownUntil - new Date().getTime()) / 1000)}s`,
//       p,
//     );
//     p.activation = 0;
//     room.setPlayerAvatar(p.id, "🚫");
//     setTimeout(() => room.setPlayerAvatar(p.id, ""), 200);
//     return;
//   }
//   room.setPlayerDiscProperties(p.id, {
//     xspeed: props.xspeed * 3.4,
//     yspeed: props.yspeed * 3.4,
//     xgravity: -props.xspeed * 0.026,
//     ygravity: -props.yspeed * 0.026,
//   });
//   room.setPlayerAvatar(p.id, "👟");
//   p.sliding = true;
//   await sleep(900);
//   p.sliding = false;
//   p.slowdown = 0.13;
//   p.slowdownUntil = new Date().getTime() + 1000 * 3;
//   p.cooldownUntil = new Date().getTime() + 23000;
//   room.setPlayerAvatar(p.id, "");
// };
/*//*/

// ajustar manualmente esse código aqui, juntar com o antigo tackle do notepad ++

export const rotateBall = (game: Game) => {
  if (game.ballRotation.power < 0.02) {
    game.ballRotation.power = 0;
    room.setDiscProperties(0, {
      xgravity: 0,
      ygravity: 0,
    });

    return;
  }
  room.setDiscProperties(0, {
    xgravity: 0.01 * game.ballRotation.x * game.ballRotation.power,
    ygravity: 0.01 * game.ballRotation.y * game.ballRotation.power,
  });
  //game.ballRotation.power *= 0.95;

  //game.ballRotation.power *= 0.735;

  game.ballRotation.power *= 0.5;
};

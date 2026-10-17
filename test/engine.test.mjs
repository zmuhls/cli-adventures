// Plays the engine headlessly: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../static/engine.js', import.meta.url), 'utf8');
const CLIGame = new Function(`${source}; return CLIGame;`)();
const plain = text => text.replace(/\u001b\[\d+m/g, '');

function play(commands) {
    const game = new CLIGame();
    const results = commands.map(command => plain(game.processCommand(command).result));
    return { game, results };
}

const MISSION = [
    'ls', 'cd documents', 'cat secret.txt', 'pwd', 'cd ..', 'cat mission.txt',
    'cd projects', 'cd hidden_vault', 'cd ~', 'cd downloads', 'unzip archive.zip',
    'cd archive', 'mkdir relics', 'cd ~', 'cd projects', 'cd hidden_vault',
    'mv treasure.json ~/downloads/archive/relics',
];

test('the full mission completes every challenge on the final move', () => {
    const { game, results } = play(MISSION);
    assert.equal(game.completed_lessons.size, game.lessons.length);
    assert.match(results.at(-1), /Challenge completed: Return the treasure/);
    assert.match(results.at(-1), /MISSION ACCOMPLISHED/);
});

test('reaching hidden_vault with cd completes the find challenge', () => {
    const { game, results } = play(MISSION.slice(0, 8));
    assert.match(results.at(-1), /Challenge completed: Locate the stolen treasure/);
    assert.equal(game.getCurrentChallenge().id, 'unzip_archive');
});

test('a failed command does not complete a challenge', () => {
    const { game } = play(['ls', 'cd nowhere']);
    assert.equal(game.getCurrentChallenge().id, 'cd');
});

test('paths show where the player is', () => {
    const { game, results } = play(['cd projects/', 'cd hidden_vault', 'pwd']);
    assert.equal(game.getPath(), '~/projects/hidden_vault');
    assert.equal(results.at(-1), '/home/fsociety/projects/hidden_vault');
});

test('absolute paths under /home/fsociety work like ~', () => {
    const { game } = play(['cd /home/fsociety/projects/hidden_vault']);
    assert.equal(game.getPath(), '~/projects/hidden_vault');
});

test('clashing directory names keep their own parent', () => {
    const { game, results } = play(['ls', 'cd documents', 'mkdir projects', 'cd projects', 'pwd', 'ls', 'cd ..']);
    assert.equal(results[4], '/home/fsociety/documents/projects');
    assert.equal(results[5], '');
    assert.equal(game.getPath(), '~/documents');
});

test('reset restores the starting world, including deleted files and the archive', () => {
    const { game, results } = play([
        'rm mission.txt', 'rm mission.txt', 'cd downloads', 'unzip archive.zip', 'cd archive', 'mkdir relics',
        'reset', 'cat mission.txt', 'cd downloads', 'unzip archive.zip', 'cd archive', 'ls',
    ]);
    assert.match(results[7], /MISSION BRIEFING/);
    assert.match(results.at(-1), /\nREADME\.txt data\.csv$/);
    assert.deepEqual([...game.completed_lessons], ['ls']);
});

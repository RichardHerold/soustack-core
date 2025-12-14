#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { validateRecipe } from '../src/validator';
import { scaleRecipe } from '../src/parser';

// Grab arguments from the terminal
const command = process.argv[2]; // e.g., "validate" or "scale"
const filePath = process.argv[3]; // e.g., "./recipes/sourdough.json"
const scaleFactor = process.argv[4] ? parseFloat(process.argv[4]) : 1;

function main() {
  if (!command || !filePath) {
    console.log("Usage:");
    console.log("  npx ts-node bin/cli.ts validate <recipe-file>");
    console.log("  npx ts-node bin/cli.ts scale <recipe-file> <yield-multiplier>");
    process.exit(1);
  }

  // Read the file
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`❌ File not found: ${absolutePath}`);
    process.exit(1);
  }

  const rawData = fs.readFileSync(absolutePath, 'utf-8');
  let recipe;

  try {
    recipe = JSON.parse(rawData);
  } catch (e) {
    console.error("❌ Error parsing JSON file.");
    process.exit(1);
  }

  // execute command
  if (command === 'validate') {
    try {
      validateRecipe(recipe);
      console.log("✅ Valid Soustack Recipe!");
    } catch (e: any) {
      console.error("❌ Invalid Recipe Schema:");
      console.error(e.message);
    }
  } 
  
  else if (command === 'scale') {
    try {
      console.log(`\n⚖️  Scaling "${recipe.name}" by ${scaleFactor}x...\n`);
      const baseYield = recipe.yield?.amount || 1;
      const targetYield = baseYield * scaleFactor;
      const result = scaleRecipe(recipe, targetYield);
      
      console.log("--- INGREDIENTS ---");
      result.ingredients.forEach(ing => {
        // Pad the text for cleaner alignment
        console.log(`• ${ing.text}`);
      });
      
      console.log("\n--- TIMING ---");
      console.log(`Total Time: ${result.timing.total} minutes`);
      console.log(`(Active: ${result.timing.active}m | Passive: ${result.timing.passive}m)`);
      
    } catch (e: any) {
      console.error("❌ Scaling failed:", e.message);
    }
  } 
  
  else {
    console.error("Unknown command. Use 'validate' or 'scale'.");
  }
}

main();
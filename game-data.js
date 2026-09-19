"use strict";
(function (root, factory) {
  const data = factory();
  if (typeof module === "object" && module.exports) module.exports = data;
  else root.DoudiData = data;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const spaces = [
    { name: "START", type: "corner", note: "Collect £200" },
    { name: "Old Kent Road", group: "brown", price: 60, rent: 2 },
    { name: "Community Chest", type: "chest", note: "Draw a card" },
    { name: "Whitechapel Road", group: "brown", price: 60, rent: 4 },
    { name: "Income Tax", type: "tax", note: "Pay £200" },
    { name: "King’s Cross", group: "station", price: 200, rent: 25 },
    { name: "The Angel, Islington", group: "lightblue", price: 100, rent: 6 },
    { name: "Chance", type: "chance", note: "Take a chance" },
    { name: "Euston Road", group: "lightblue", price: 100, rent: 6 },
    { name: "Pentonville Road", group: "lightblue", price: 120, rent: 8 },
    { name: "JAIL", type: "corner", note: "Just visiting" },
    { name: "DOUDI SPACE", type: "doudi", note: "Choose your fate" },
    { name: "Pall Mall", group: "pink", price: 140, rent: 10 },
    { name: "Electric Company", type: "utility", price: 150, rent: 0 },
    { name: "Whitehall", group: "pink", price: 140, rent: 10 },
    { name: "Northumberland Ave", group: "pink", price: 160, rent: 12 },
    { name: "Marylebone Station", group: "station", price: 200, rent: 25 },
    { name: "Bow Street", group: "orange", price: 180, rent: 14 },
    { name: "Community Chest", type: "chest", note: "Draw a card" },
    { name: "Marlborough Street", group: "orange", price: 180, rent: 14 },
    { name: "Vine Street", group: "orange", price: 200, rent: 16 },
    { name: "FREE PARKING", type: "corner", note: "Take a breather" },
    { name: "DOUDI SPACE", type: "doudi", note: "Choose your fate" },
    { name: "Strand", group: "red", price: 220, rent: 18 },
    { name: "Chance", type: "chance", note: "Take a chance" },
    { name: "Fleet Street", group: "red", price: 220, rent: 18 },
    { name: "Trafalgar Square", group: "red", price: 240, rent: 20 },
    { name: "Fenchurch Station", group: "station", price: 200, rent: 25 },
    { name: "Leicester Square", group: "yellow", price: 260, rent: 22 },
    { name: "Coventry Street", group: "yellow", price: 260, rent: 22 },
    { name: "Water Works", type: "utility", price: 150, rent: 0 },
    { name: "Piccadilly", group: "yellow", price: 280, rent: 24 },
    { name: "GO TO JAIL", type: "corner", note: "Do not pass GO" },
    { name: "DOUDI SPACE", type: "doudi", note: "Choose your fate" },
    { name: "Regent Street", group: "green", price: 300, rent: 26 },
    { name: "Oxford Street", group: "green", price: 300, rent: 26 },
    { name: "Community Chest", type: "chest", note: "Draw a card" },
    { name: "Bond Street", group: "green", price: 320, rent: 28 },
    { name: "Liverpool Street", group: "station", price: 200, rent: 25 },
    { name: "Chance", type: "chance", note: "Take a chance" },
    { name: "Park Lane", group: "darkblue", price: 350, rent: 35 },
    { name: "Super Tax", type: "tax", note: "Pay £100" },
    { name: "Mayfair", group: "darkblue", price: 400, rent: 50 },
    { name: "DOUDI SPACE", type: "doudi", note: "Choose your fate" },
  ];

  const colors = {
    brown: "#a87850",
    lightblue: "#91cde0",
    pink: "#db90b4",
    orange: "#efa15d",
    red: "#ea756b",
    yellow: "#f4ca60",
    green: "#85b994",
    darkblue: "#7886c9",
    station: "#2d3748",
    utility: "#80a4b8",
  };
  const groupLabels = {
    brown: "Brown set",
    lightblue: "Light blue set",
    pink: "Pink set",
    orange: "Orange set",
    red: "Red set",
    yellow: "Yellow set",
    green: "Green set",
    darkblue: "Blue set",
    station: "Stations",
    utility: "Utilities",
  };

  const playerColors = [
    "#ef5b5b",
    "#4d78df",
    "#2ead78",
    "#e3a52f",
    "#9569d8",
    "#df5d9b",
  ];
  const tokenTypes = ["pawn", "car", "hat", "boot", "ship", "dog"];
  function boardCell(index) {
    if (index <= 11) return [1, index + 1];
    if (index <= 22) return [index - 10, 12];
    if (index <= 33) return [12, 34 - index];
    return [45 - index, 1];
  }
  return { spaces, colors, groupLabels, playerColors, tokenTypes, boardCell };
});

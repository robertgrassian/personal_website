import { commonsSource } from "./commons.ts";

// Engravings from a French seed house's 1883 catalogue of kitchen-garden plants. The plates are
// named in French by variety, in older spellings (an onion is an "ognon"), so the comment on each
// entry is the plate's own name.
//
// An 1883 French catalogue has no modern American cultivars, so some entries are the nearest
// thing in it and not the variety itself: acorn, kabocha and spaghetti squash (an Ohio squash, a
// Boulogne pumpkin and a vegetable marrow), broccoli (a sprouting broccoli), Sungolds (a currant
// tomato), honeydew (a green-fleshed winter melon) and collards (a tree cabbage).
//
// Nothing usable for: broccoli rabe, delicata squash, fiddleheads, garlic scapes, napa cabbage,
// ramps, tomatillo (the only Physalis is a ground cherry, drawn as a whole bush), cilantro, dill,
// mint (the plate that looks like it is lemon balm), or any of the mushrooms.
export const VILMORIN_ANDRIEUX = commonsSource({
  id: "vilmorin-andrieux",
  name: "Vilmorin-Andrieux, Les plantes potagères (1883)",
  category: "Vilmorin-Andrieux, Les plantes potagères 1883",
  license: "Public domain",
  kind: "engraving",
  files: {
    // Courge de l'Ohio
    "acorn-squash": "Courge de l'Ohio Vilmorin-Andrieux 1883.png",
    // Artichaut gros vert de Laon
    artichoke: "Artichaut gros vert de Laon Vilmorin-Andrieux 1883.png",
    // Roquette
    arugula: "Roquette Vilmorin-Andrieux 1883.png",
    // Asperge de Hollande
    asparagus: "Asperge de Hollande Vilmorin-Andrieux 1883.png",
    // Basilic grand
    basil: "Basilic grand Vilmorin-Andrieux 1883.png",
    // Betterave rouge globe
    beet: "Betterave rouge globe Vilmorin-Andrieux 1883.png",
    // Piment gros carré doux
    "bell-pepper": "Piment gros carré doux Vilmorin-Andrieux 1883.png",
    // Pak-choi
    "bok-choy": "Pak-choi Vilmorin-Andrieux 1883.png",
    // Brocoli branchu
    broccoli: "Brocoli branchu Vilmorin-Andrieux 1883.png",
    // Chou de Bruxelles ordinaire
    "brussels-sprouts": "Chou de Bruxelles ordinaire Vilmorin-Andrieux 1883.png",
    // Courge pleine de Naples
    "butternut-squash": "Courge pleine de Naples Vilmorin-Andrieux 1883.png",
    // Chou Bacalan gros
    cabbage: "Chou Bacalan gros Vilmorin-Andrieux 1883.png",
    // Melon cantaloup orange
    cantaloupe: "Melon cantaloup orange Vilmorin-Andrieux 1883.png",
    // Carotte rouge demi-longue obtuse
    carrot: "Carotte rouge demi-longue obtuse Vilmorin-Andrieux 1883.png",
    // Chou-fleur Lenormand
    cauliflower: "Chou-fleur Lenormand Vilmorin-Andrieux 1883.png",
    // Céleri-rave
    celeriac: "Céleri-rave Vilmorin-Andrieux 1883.png",
    // Céleri plein blanc
    celery: "Céleri plein blanc Vilmorin-Andrieux 1883.png",
    // Poirée blonde à carde blanche
    chard: "Poirée blonde à carde blanche Vilmorin-Andrieux 1883.png",
    // Tomate cerise
    "cherry-tomato": "Tomate cerise Vilmorin-Andrieux 1883.png",
    // Piment rouge long
    "chile-pepper": "Piment rouge long Vilmorin-Andrieux 1883.png",
    // Ciboulette
    chives: "Ciboulette Vilmorin-Andrieux 1883.png",
    // Chou cavalier
    "collard-greens": "Chou cavalier Vilmorin-Andrieux 1883.png",
    // Concombre long vert d'Athènes
    cucumber: "Concombre long vert d'Athènes Vilmorin-Andrieux 1883.png",
    // Pissenlit amélioré très hâtif
    "dandelion-greens": "Pissenlit amélioré très hâtif Vilmorin-Andrieux 1883.png",
    // Aubergine violette longue
    eggplant: "Aubergine violette longue Vilmorin-Andrieux 1883.png",
    // Fève de Windsor
    "fava-bean": "Fève de Windsor Vilmorin-Andrieux 1883.png",
    // Fenouil de Florence
    fennel: "Fenouil de Florence Vilmorin-Andrieux 1883.png",
    // Ail ordinaire
    garlic: "Ail ordinaire - Vilmorin-Andrieux, 1883.png",
    // Haricot noir de Belgique
    "green-bean": "Haricot noir de Belgique Vilmorin-Andrieux 1883.png",
    // Tomate rouge grosse hâtive
    "heirloom-tomato": "Tomate rouge grosse hâtive Vilmorin-Andrieux 1883.png",
    // Melon de Malte d'hiver à chair verte
    honeydew: "Melon de Malte d'hiver à chair verte Vilmorin-Andrieux 1883.png",
    // Raifort sauvage
    horseradish: "Raifort sauvage Vilmorin-Andrieux 1883.png",
    // Potiron gris de Boulogne
    "kabocha-squash": "Potiron gris de Boulogne Vilmorin-Andrieux 1883.png",
    // Chou frisé vert grand
    kale: "Chou frisé vert grand Vilmorin-Andrieux 1883.png",
    // Chou-rave blanc hâtif de Vienne
    kohlrabi: "Chou-rave blanc hâtif de Vienne Vilmorin-Andrieux 1883.png",
    // Poireau long d'hiver de Paris
    leek: "Poireau long d'hiver de Paris Vilmorin-Andrieux 1883.png",
    // Laitue grosse blonde paresseuse
    lettuce: "Laitue grosse blonde paresseuse Vilmorin-Andrieux 1883.png",
    // Moutarde de Chine à feuille de chou
    "mustard-greens": "Moutarde de Chine à feuille de chou Vilmorin-Andrieux 1883.png",
    // Gombo à fruit long
    okra: "Gombo à fruit long Vilmorin-Andrieux 1883.png",
    // Ognon jaune des Vertus
    onion: "Ognon jaune des Vertus Vilmorin-Andrieux 1883.png",
    // Marjolaine vivace
    oregano: "Marjolaine vivace Vilmorin-Andrieux 1883.png",
    // Persil commun
    parsley: "Persil commun Vilmorin-Andrieux 1883.png",
    // Panais long
    parsnip: "Panais long Vilmorin-Andrieux 1883.png",
    // Pomme de terre rose hâtive
    potato: "Pomme de terre rose hâtive Vilmorin-Andrieux 1883.png",
    // Potiron rouge vif d'Étampes
    pumpkin: "Potiron rouge vif d'Étampes Vilmorin-Andrieux 1883.png",
    // Chicorée sauvage à feuille rouge
    radicchio: "Chicorée sauvage à feuille rouge Vilmorin-Andrieux 1904.png",
    // Radis rond écarlate
    radish: "Radis rond écarlate Vilmorin-Andrieux 1883.png",
    // Rhubarbe
    rhubarb: "Rhubarbe Vilmorin-Andrieux 1883.png",
    // Romarin
    rosemary: "Romarin Vilmorin-Andrieux 1883.png",
    // Rutabaga à collet violet
    rutabaga: "Rutabaga à collet violet Vilmorin-Andrieux 1883.png",
    // Sauge officinale
    sage: "Sauge officinale Vilmorin-Andrieux 1883.png",
    // Ciboule commune
    scallion: "Ciboule commune Vilmorin-Andrieux 1883.png",
    // Échalote ordinaire
    shallot: "Échalote ordinaire Vilmorin-Andrieux 1883.png",
    // Pois téléphone
    "shelling-pea": "Pois téléphone Vilmorin-Andrieux 1883.png",
    // Pois géant sans parchemin
    "snap-pea": "Pois géant sans parchemin Vilmorin-Andrieux 1883.png",
    // Pois corne de bélier2
    "snow-pea": "Pois corne de bélier2 Vilmorin-Andrieux 1883.png",
    // Oseille de Belleville
    sorrel: "Oseille de Belleville Vilmorin-Andrieux 1883.png",
    // Courge à la moelle
    "spaghetti-squash": "Courge à la moelle Vilmorin-Andrieux 1883.png",
    // Épinard d'Angleterre
    spinach: "Épinard d'Angleterre Vilmorin-Andrieux 1883.png",
    // Patisson jaune
    "summer-squash": "Patisson jaune Vilmorin-Andrieux 1883.png",
    // Topinambour
    sunchoke: "Topinambour Vilmorin-Andrieux 1883.png",
    // Tomate groseille
    "sungold-tomato": "Tomate groseille Vilmorin-Andrieux 1883.png",
    // Maïs sucré
    "sweet-corn": "Maïs sucré Vilmorin-Andrieux 1883.png",
    // Patate rose de Malaga
    "sweet-potato": "Patate rose de Malaga Vilmorin-Andrieux 1883.png",
    // Estragon
    tarragon: "Estragon Vilmorin-Andrieux 1883.png",
    // Thym ordinaire
    thyme: "Thym ordinaire Vilmorin-Andrieux 1883.png",
    // Tomate rouge grosse lisse
    tomato: "Tomate rouge grosse lisse Vilmorin-Andrieux 1883.png",
    // Navet rouge plat hâtif à feuille entière
    turnip: "Navet rouge plat hâtif à feuille entière Vilmorin-Andrieux 1883.png",
    // Cresson de fontaine
    watercress: "Cresson de fontaine Vilmorin-Andrieux 1883.png",
    // Courge d'Italie
    zucchini: "Courge d'Italie Vilmorin-Andrieux 1883.png",
  },
});

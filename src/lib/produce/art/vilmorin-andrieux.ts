import type { ArtImage, ArtSource } from "../types.ts";

// One entry is a slug, and the engraving's file name on Wikimedia Commons. The picture itself is
// that file trimmed to the ink, with the scanned paper pushed to white so it multiplies away.
function image(slug: string, commonsFile: string): ArtImage {
  return {
    file: `produce/art/vilmorin-andrieux/${slug}.jpg`,
    sourceUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(commonsFile)}`,
  };
}

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
export const VILMORIN_ANDRIEUX: ArtSource = {
  id: "vilmorin-andrieux",
  credit: {
    name: "Vilmorin-Andrieux, Les plantes potagères (1883)",
    url: "https://commons.wikimedia.org/wiki/Category:Vilmorin-Andrieux,_Les_plantes_potag%C3%A8res_1883",
  },
  license: "Public domain",
  kind: "engraving",
  images: {
    // Courge de l'Ohio
    "acorn-squash": image("acorn-squash", "Courge_de_l'Ohio_Vilmorin-Andrieux_1883.png"),
    // Artichaut gros vert de Laon
    artichoke: image("artichoke", "Artichaut_gros_vert_de_Laon_Vilmorin-Andrieux_1883.png"),
    // Roquette
    arugula: image("arugula", "Roquette_Vilmorin-Andrieux_1883.png"),
    // Asperge de Hollande
    asparagus: image("asparagus", "Asperge_de_Hollande_Vilmorin-Andrieux_1883.png"),
    // Basilic grand
    basil: image("basil", "Basilic_grand_Vilmorin-Andrieux_1883.png"),
    // Betterave rouge globe
    beet: image("beet", "Betterave_rouge_globe_Vilmorin-Andrieux_1883.png"),
    // Piment gros carré doux
    "bell-pepper": image("bell-pepper", "Piment_gros_carré_doux_Vilmorin-Andrieux_1883.png"),
    // Pak-choi
    "bok-choy": image("bok-choy", "Pak-choi_Vilmorin-Andrieux_1883.png"),
    // Brocoli branchu
    broccoli: image("broccoli", "Brocoli_branchu_Vilmorin-Andrieux_1883.png"),
    // Chou de Bruxelles ordinaire
    "brussels-sprouts": image(
      "brussels-sprouts",
      "Chou_de_Bruxelles_ordinaire_Vilmorin-Andrieux_1883.png"
    ),
    // Courge pleine de Naples
    "butternut-squash": image(
      "butternut-squash",
      "Courge_pleine_de_Naples_Vilmorin-Andrieux_1883.png"
    ),
    // Chou Bacalan gros
    cabbage: image("cabbage", "Chou_Bacalan_gros_Vilmorin-Andrieux_1883.png"),
    // Melon cantaloup orange
    cantaloupe: image("cantaloupe", "Melon_cantaloup_orange_Vilmorin-Andrieux_1883.png"),
    // Carotte rouge demi-longue obtuse
    carrot: image("carrot", "Carotte_rouge_demi-longue_obtuse_Vilmorin-Andrieux_1883.png"),
    // Chou-fleur Lenormand
    cauliflower: image("cauliflower", "Chou-fleur_Lenormand_Vilmorin-Andrieux_1883.png"),
    // Céleri-rave
    celeriac: image("celeriac", "Céleri-rave_Vilmorin-Andrieux_1883.png"),
    // Céleri plein blanc
    celery: image("celery", "Céleri_plein_blanc_Vilmorin-Andrieux_1883.png"),
    // Poirée blonde à carde blanche
    chard: image("chard", "Poirée_blonde_à_carde_blanche_Vilmorin-Andrieux_1883.png"),
    // Tomate cerise
    "cherry-tomato": image("cherry-tomato", "Tomate_cerise_Vilmorin-Andrieux_1883.png"),
    // Piment rouge long
    "chile-pepper": image("chile-pepper", "Piment_rouge_long_Vilmorin-Andrieux_1883.png"),
    // Ciboulette
    chives: image("chives", "Ciboulette_Vilmorin-Andrieux_1883.png"),
    // Chou cavalier
    "collard-greens": image("collard-greens", "Chou_cavalier_Vilmorin-Andrieux_1883.png"),
    // Concombre long vert d'Athènes
    cucumber: image("cucumber", "Concombre_long_vert_d'Athènes_Vilmorin-Andrieux_1883.png"),
    // Pissenlit amélioré très hâtif
    "dandelion-greens": image(
      "dandelion-greens",
      "Pissenlit_amélioré_très_hâtif_Vilmorin-Andrieux_1883.png"
    ),
    // Aubergine violette longue
    eggplant: image("eggplant", "Aubergine_violette_longue_Vilmorin-Andrieux_1883.png"),
    // Fève de Windsor
    "fava-bean": image("fava-bean", "Fève_de_Windsor_Vilmorin-Andrieux_1883.png"),
    // Fenouil de Florence
    fennel: image("fennel", "Fenouil_de_Florence_Vilmorin-Andrieux_1883.png"),
    // Ail ordinaire
    garlic: image("garlic", "Ail_ordinaire_-_Vilmorin-Andrieux,_1883.png"),
    // Haricot noir de Belgique
    "green-bean": image("green-bean", "Haricot_noir_de_Belgique_Vilmorin-Andrieux_1883.png"),
    // Tomate rouge grosse hâtive
    "heirloom-tomato": image(
      "heirloom-tomato",
      "Tomate_rouge_grosse_hâtive_Vilmorin-Andrieux_1883.png"
    ),
    // Melon de Malte d'hiver à chair verte
    honeydew: image("honeydew", "Melon_de_Malte_d'hiver_à_chair_verte_Vilmorin-Andrieux_1883.png"),
    // Raifort sauvage
    horseradish: image("horseradish", "Raifort_sauvage_Vilmorin-Andrieux_1883.png"),
    // Potiron gris de Boulogne
    "kabocha-squash": image(
      "kabocha-squash",
      "Potiron_gris_de_Boulogne_Vilmorin-Andrieux_1883.png"
    ),
    // Chou frisé vert grand
    kale: image("kale", "Chou_frisé_vert_grand_Vilmorin-Andrieux_1883.png"),
    // Chou-rave blanc hâtif de Vienne
    kohlrabi: image("kohlrabi", "Chou-rave_blanc_hâtif_de_Vienne_Vilmorin-Andrieux_1883.png"),
    // Poireau long d'hiver de Paris
    leek: image("leek", "Poireau_long_d'hiver_de_Paris_Vilmorin-Andrieux_1883.png"),
    // Laitue grosse blonde paresseuse
    lettuce: image("lettuce", "Laitue_grosse_blonde_paresseuse_Vilmorin-Andrieux_1883.png"),
    // Moutarde de Chine à feuille de chou
    "mustard-greens": image(
      "mustard-greens",
      "Moutarde_de_Chine_à_feuille_de_chou_Vilmorin-Andrieux_1883.png"
    ),
    // Gombo à fruit long
    okra: image("okra", "Gombo_à_fruit_long_Vilmorin-Andrieux_1883.png"),
    // Ognon jaune des Vertus
    onion: image("onion", "Ognon_jaune_des_Vertus_Vilmorin-Andrieux_1883.png"),
    // Marjolaine vivace
    oregano: image("oregano", "Marjolaine_vivace_Vilmorin-Andrieux_1883.png"),
    // Persil commun
    parsley: image("parsley", "Persil_commun_Vilmorin-Andrieux_1883.png"),
    // Panais long
    parsnip: image("parsnip", "Panais_long_Vilmorin-Andrieux_1883.png"),
    // Pomme de terre rose hâtive
    potato: image("potato", "Pomme_de_terre_rose_hâtive_Vilmorin-Andrieux_1883.png"),
    // Potiron rouge vif d'Étampes
    pumpkin: image("pumpkin", "Potiron_rouge_vif_d'Étampes_Vilmorin-Andrieux_1883.png"),
    // Chicorée sauvage à feuille rouge
    radicchio: image("radicchio", "Chicorée_sauvage_à_feuille_rouge_Vilmorin-Andrieux_1904.png"),
    // Radis rond écarlate
    radish: image("radish", "Radis_rond_écarlate_Vilmorin-Andrieux_1883.png"),
    // Rhubarbe
    rhubarb: image("rhubarb", "Rhubarbe_Vilmorin-Andrieux_1883.png"),
    // Romarin
    rosemary: image("rosemary", "Romarin_Vilmorin-Andrieux_1883.png"),
    // Rutabaga à collet violet
    rutabaga: image("rutabaga", "Rutabaga_à_collet_violet_Vilmorin-Andrieux_1883.png"),
    // Sauge officinale
    sage: image("sage", "Sauge_officinale_Vilmorin-Andrieux_1883.png"),
    // Ciboule commune
    scallion: image("scallion", "Ciboule_commune_Vilmorin-Andrieux_1883.png"),
    // Échalote ordinaire
    shallot: image("shallot", "Échalote_ordinaire_Vilmorin-Andrieux_1883.png"),
    // Pois téléphone
    "shelling-pea": image("shelling-pea", "Pois_téléphone_Vilmorin-Andrieux_1883.png"),
    // Pois géant sans parchemin
    "snap-pea": image("snap-pea", "Pois_géant_sans_parchemin_Vilmorin-Andrieux_1883.png"),
    // Pois corne de bélier2
    "snow-pea": image("snow-pea", "Pois_corne_de_bélier2_Vilmorin-Andrieux_1883.png"),
    // Oseille de Belleville
    sorrel: image("sorrel", "Oseille_de_Belleville_Vilmorin-Andrieux_1883.png"),
    // Courge à la moelle
    "spaghetti-squash": image("spaghetti-squash", "Courge_à_la_moelle_Vilmorin-Andrieux_1883.png"),
    // Épinard d'Angleterre
    spinach: image("spinach", "Épinard_d'Angleterre_Vilmorin-Andrieux_1883.png"),
    // Patisson jaune
    "summer-squash": image("summer-squash", "Patisson_jaune_Vilmorin-Andrieux_1883.png"),
    // Topinambour
    sunchoke: image("sunchoke", "Topinambour_Vilmorin-Andrieux_1883.png"),
    // Tomate groseille
    "sungold-tomato": image("sungold-tomato", "Tomate_groseille_Vilmorin-Andrieux_1883.png"),
    // Maïs sucré
    "sweet-corn": image("sweet-corn", "Maïs_sucré_Vilmorin-Andrieux_1883.png"),
    // Patate rose de Malaga
    "sweet-potato": image("sweet-potato", "Patate_rose_de_Malaga_Vilmorin-Andrieux_1883.png"),
    // Estragon
    tarragon: image("tarragon", "Estragon_Vilmorin-Andrieux_1883.png"),
    // Thym ordinaire
    thyme: image("thyme", "Thym_ordinaire_Vilmorin-Andrieux_1883.png"),
    // Tomate rouge grosse lisse
    tomato: image("tomato", "Tomate_rouge_grosse_lisse_Vilmorin-Andrieux_1883.png"),
    // Navet rouge plat hâtif à feuille entière
    turnip: image("turnip", "Navet_rouge_plat_hâtif_à_feuille_entière_Vilmorin-Andrieux_1883.png"),
    // Cresson de fontaine
    watercress: image("watercress", "Cresson_de_fontaine_Vilmorin-Andrieux_1883.png"),
    // Courge d'Italie
    zucchini: image("zucchini", "Courge_d'Italie_Vilmorin-Andrieux_1883.png"),
  },
};

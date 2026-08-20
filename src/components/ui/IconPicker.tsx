import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Apple,
  Backpack,
  Banknote,
  Beef,
  Beer,
  Bed,
  Bike,
  BookOpen,
  Book,
  Bus,
  Camera,
  Car,
  Check,
  Circle,
  CircleDot,
  ChartLine,
  Clapperboard,
  Coffee,
  Compass,
  CreditCard,
  Cpu,
  Droplet,
  Dumbbell,
  Film,
  Flame,
  Footprints,
  Fuel,
  Gamepad2,
  Gift,
  Globe,
  Goal,
  GraduationCap,
  Guitar,
  HandCoins,
  Headphones,
  Heart,
  HeartPulse,
  Hotel,
  House,
  Landmark,
  Languages,
  Laptop,
  Leaf,
  Lightbulb,
  Luggage,
  Map as MapIcon,
  MapPinned,
  Medal,
  Monitor,
  Mountain,
  Music,
  NotebookPen,
  Palette,
  PawPrint,
  Pencil,
  Pill,
  PiggyBank,
  Pizza,
  Plane,
  Plug,
  Salad,
  Sandwich,
  Scissors,
  Search,
  Ship,
  ShoppingBag,
  Smartphone,
  Sofa,
  Speech,
  Sparkles,
  Stethoscope,
  Tent,
  Ticket,
  Timer,
  TrainFront,
  TreePalm,
  Trophy,
  Tv,
  User,
  Users,
  Utensils,
  Volleyball,
  Wallet,
  Waves,
  Wifi,
  Wine,
  Wrench,
  X,
  Ambulance, Anchor, Armchair, Baby, Bath, BatteryCharging, Bird, Bitcoin, Bookmark, Bot, BrainCircuit, Briefcase, Building2, Cake, Calculator, Caravan, Carrot, Cat, ChartColumn, ChartPie, ChefHat, Cherry, ClipboardList, Cloud, CloudSun, Code, Coins, Croissant, CupSoda, Database, Dices, Disc3, Dog, DollarSign, Donut, DoorOpen, Egg, Euro, FileText, Fish, Flag, Flower, Forklift, Gauge, GitBranch, Glasses, Hammer, Handshake, HardDrive, IceCream, Joystick, Keyboard, Library, ListMusic, Martini, Mic, Microwave, Milk, MonitorPlay, Mouse, Navigation, Package, Percent, PlaneLanding, PlaneTakeoff, Podcast, Popcorn, Presentation, Printer, Projector, Puzzle, Radar, Radio, Receipt, Recycle, Refrigerator, Repeat, Rocket, Route, Sailboat, Satellite, School, Server, Shirt, Snowflake, Soup, Speaker, Sprout, Store, Sun, Swords, Tag, Target, Terminal, TowerControl, TrafficCone, TramFront, Trees, Truck, Twitch, Umbrella, University, Video, Warehouse, WashingMachine, Watch, Wind, Youtube,
  Activity, Amphora, Antenna, Aperture, Binoculars, BookA, BookMarked, Boxes, Brush, Cable, Castle,
  Cctv, Church, Cog, Crosshair, Drama, Earth, Fan, Feather, Headset, Images, Layers, Locate,
  MemoryStick, MessageSquareQuote, Milestone, MonitorSpeaker, MountainSnow, Music4, Newspaper,
  Origami, PaintRoller, PersonStanding, Piano, Pyramid, Quote, Ruler, ScanEye, ScrollText,
  Signpost, SlidersVertical, Stamp, Sunrise, Sunset, Telescope, TentTree, Theater, Thermometer,
  Orbit, Usb, Waypoints, Webcam,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Icon picker
 * -----------
 * Every icon here is a real `lucide-react` export, imported statically. That
 * buys two things a name-to-namespace lookup cannot: the bundler only ships the
 * icons this picker offers, and an unknown or renamed icon can never crash a
 * render — `resolveIcon` falls back to a neutral mark instead.
 *
 * Stored activities keep the icon *name*, not the component, so the data stays
 * portable and survives an icon-library upgrade.
 */

export interface IconOption {
  /** The lucide export name, stored on the activity. */
  name: string;
  /** Human label shown in the picker and matched by search. */
  label: string;
  icon: LucideIcon;
  /** Extra search terms — what a person would type looking for this icon. */
  keywords?: string;
}

export interface IconCategory {
  id: string;
  label: string;
  icons: IconOption[];
}

export const ICON_CATEGORIES: IconCategory[] = [
  {
    id: "transportation",
    label: "Transportation",
    icons: [
      { name: "Plane", label: "Plane", icon: Plane, keywords: "flight fly airport airline" },
      { name: "Car", label: "Car", icon: Car, keywords: "drive vehicle taxi uber parking" },
      { name: "Bus", label: "Bus", icon: Bus, keywords: "coach transit commute public" },
      { name: "TrainFront", label: "Train", icon: TrainFront, keywords: "rail metro subway commute" },
      { name: "Fuel", label: "Fuel", icon: Fuel, keywords: "petrol gas station diesel charge" },
      { name: "Bike", label: "Bike", icon: Bike, keywords: "cycling bicycle ride" },
      { name: "Ship", label: "Ferry", icon: Ship, keywords: "boat ferry cruise sea" },
      { name: "TramFront", label: "Tram", icon: TramFront, keywords: "streetcar transit city rail" },
      { name: "Caravan", label: "Camper", icon: Caravan, keywords: "motorhome van road trip" },
      { name: "Ambulance", label: "Emergency", icon: Ambulance, keywords: "medical transport hospital" },
      { name: "TrafficCone", label: "Road works", icon: TrafficCone, keywords: "traffic detour construction" },
      { name: "Forklift", label: "Freight", icon: Forklift, keywords: "cargo warehouse logistics" },
      { name: "Sailboat", label: "Sailing", icon: Sailboat, keywords: "yacht boat marina" },
    ],
  },
  {
    id: "sports",
    label: "Sports",
    icons: [
      { name: "Volleyball", label: "Ball sport", icon: Volleyball, keywords: "tennis racket padel squash football basketball ball" },
      { name: "Goal", label: "Goal", icon: Goal, keywords: "football soccer pitch match" },
      { name: "CircleDot", label: "Court sport", icon: CircleDot, keywords: "tennis basketball ping pong ball court" },
      { name: "Waves", label: "Swimming", icon: Waves, keywords: "swim pool water surf" },
      { name: "Dumbbell", label: "Gym", icon: Dumbbell, keywords: "weights fitness training workout" },
      { name: "Footprints", label: "Running", icon: Footprints, keywords: "run jog walk marathon steps" },
      { name: "Trophy", label: "Trophy", icon: Trophy, keywords: "win competition league tournament" },
      { name: "Medal", label: "Medal", icon: Medal, keywords: "award race podium" },
      { name: "Timer", label: "Training", icon: Timer, keywords: "session coach class interval" },
      { name: "Mountain", label: "Climbing", icon: Mountain, keywords: "hiking climb trek outdoor" },
      { name: "Swords", label: "Fencing", icon: Swords, keywords: "martial arts combat sparring" },
      { name: "Target", label: "Archery", icon: Target, keywords: "aim shooting darts precision" },
      { name: "Snowflake", label: "Winter sport", icon: Snowflake, keywords: "ski snowboard ice skating" },
      { name: "Activity", label: "Cardio", icon: Activity, keywords: "heart rate training zone fitness" },
      { name: "PersonStanding", label: "Coaching", icon: PersonStanding, keywords: "trainer instructor lesson class" },
      { name: "MountainSnow", label: "Skiing", icon: MountainSnow, keywords: "alps piste lift pass snowboard" },
      { name: "TentTree", label: "Trekking", icon: TentTree, keywords: "hiking wild camping trail" },
    ],
  },
  {
    id: "food",
    label: "Food & drink",
    icons: [
      { name: "Beef", label: "Burger", icon: Beef, keywords: "burger meat steak grill fastfood" },
      { name: "Pizza", label: "Pizza", icon: Pizza, keywords: "italian takeaway slice" },
      { name: "Coffee", label: "Coffee", icon: Coffee, keywords: "cafe espresso tea latte" },
      { name: "Apple", label: "Groceries", icon: Apple, keywords: "fruit grocery supermarket healthy" },
      { name: "Beer", label: "Beer", icon: Beer, keywords: "pub bar drinks pint" },
      { name: "Wine", label: "Wine", icon: Wine, keywords: "bar drinks alcohol dinner" },
      { name: "Utensils", label: "Restaurant", icon: Utensils, keywords: "dining eat out lunch dinner" },
      { name: "Sandwich", label: "Lunch", icon: Sandwich, keywords: "snack takeaway deli" },
      { name: "Salad", label: "Salad", icon: Salad, keywords: "healthy vegetables lunch" },
      { name: "Croissant", label: "Bakery", icon: Croissant, keywords: "pastry breakfast boulangerie" },
      { name: "IceCream", label: "Ice cream", icon: IceCream, keywords: "dessert gelato summer treat" },
      { name: "Cake", label: "Cake", icon: Cake, keywords: "birthday dessert patisserie" },
      { name: "Donut", label: "Snack", icon: Donut, keywords: "sweet treat sugar" },
      { name: "Egg", label: "Breakfast", icon: Egg, keywords: "eggs brunch morning" },
      { name: "Fish", label: "Seafood", icon: Fish, keywords: "sushi fishmonger salmon" },
      { name: "Carrot", label: "Vegetables", icon: Carrot, keywords: "greengrocer produce vegan" },
      { name: "Cherry", label: "Fruit", icon: Cherry, keywords: "berries produce healthy" },
      { name: "Milk", label: "Dairy", icon: Milk, keywords: "milk cheese supermarket" },
      { name: "CupSoda", label: "Soft drinks", icon: CupSoda, keywords: "soda juice takeaway drink" },
      { name: "Martini", label: "Cocktails", icon: Martini, keywords: "bar nightlife spirits" },
      { name: "Soup", label: "Soup", icon: Soup, keywords: "warm meal lunch broth" },
      { name: "ChefHat", label: "Cooking", icon: ChefHat, keywords: "recipe class kitchen" },
    ],
  },
  {
    id: "entertainment",
    label: "Entertainment",
    icons: [
      { name: "Film", label: "Film", icon: Film, keywords: "cinema movie streaming netflix" },
      { name: "Gamepad2", label: "Gaming", icon: Gamepad2, keywords: "games console playstation xbox steam" },
      { name: "Music", label: "Music", icon: Music, keywords: "spotify songs streaming audio" },
      { name: "Palette", label: "Art", icon: Palette, keywords: "painting creative hobby craft" },
      { name: "Tv", label: "TV", icon: Tv, keywords: "television streaming subscription" },
      { name: "Clapperboard", label: "Cinema", icon: Clapperboard, keywords: "movie theatre film night" },
      { name: "Ticket", label: "Tickets", icon: Ticket, keywords: "event concert show booking" },
      { name: "Guitar", label: "Instrument", icon: Guitar, keywords: "music lessons band practice" },
      { name: "Camera", label: "Photography", icon: Camera, keywords: "photo hobby lens shoot" },
      { name: "MonitorPlay", label: "Streaming", icon: MonitorPlay, keywords: "netflix disney prime video subscription" },
      { name: "Popcorn", label: "Cinema night", icon: Popcorn, keywords: "movie snack film" },
      { name: "Video", label: "Video", icon: Video, keywords: "recording youtube content creator" },
      { name: "Youtube", label: "YouTube", icon: Youtube, keywords: "video channel subscription premium" },
      { name: "Twitch", label: "Twitch", icon: Twitch, keywords: "streaming live gaming subscription" },
      { name: "Podcast", label: "Podcast", icon: Podcast, keywords: "audio show episodes subscription" },
      { name: "ListMusic", label: "Playlist", icon: ListMusic, keywords: "spotify deezer apple music songs" },
      { name: "Disc3", label: "Records", icon: Disc3, keywords: "vinyl album music collection" },
      { name: "Mic", label: "Recording", icon: Mic, keywords: "microphone studio karaoke voice" },
      { name: "Speaker", label: "Speakers", icon: Speaker, keywords: "sound audio hifi" },
      { name: "Projector", label: "Projector", icon: Projector, keywords: "home cinema screen beamer" },
    ],
  },
  {
    id: "home",
    label: "Home",
    icons: [
      { name: "House", label: "Home", icon: House, keywords: "rent mortgage housing apartment" },
      { name: "Lightbulb", label: "Electricity", icon: Lightbulb, keywords: "power utility bill energy" },
      { name: "Flame", label: "Heating", icon: Flame, keywords: "gas boiler warmth utility" },
      { name: "Droplet", label: "Water", icon: Droplet, keywords: "utility bill plumbing" },
      { name: "Sofa", label: "Furniture", icon: Sofa, keywords: "living room interior home" },
      { name: "Wrench", label: "Maintenance", icon: Wrench, keywords: "repair fix handyman service" },
      { name: "Plug", label: "Appliances", icon: Plug, keywords: "electric device home power" },
      { name: "Leaf", label: "Garden", icon: Leaf, keywords: "plants outdoor green" },
      { name: "Armchair", label: "Seating", icon: Armchair, keywords: "chair living room interior" },
      { name: "Refrigerator", label: "Fridge", icon: Refrigerator, keywords: "kitchen appliance white goods" },
      { name: "WashingMachine", label: "Laundry", icon: WashingMachine, keywords: "washer appliance chores" },
      { name: "Microwave", label: "Kitchen", icon: Microwave, keywords: "appliance cooking" },
      { name: "Bath", label: "Bathroom", icon: Bath, keywords: "shower plumbing" },
      { name: "Hammer", label: "DIY", icon: Hammer, keywords: "tools repair renovation" },
      { name: "DoorOpen", label: "Moving", icon: DoorOpen, keywords: "keys new home relocation" },
      { name: "Warehouse", label: "Storage unit", icon: Warehouse, keywords: "self storage lockup" },
      { name: "Building2", label: "Building", icon: Building2, keywords: "block flat service charge" },
    ],
  },
  {
    id: "technology",
    label: "Technology",
    icons: [
      { name: "Laptop", label: "Laptop", icon: Laptop, keywords: "computer macbook work device" },
      { name: "Smartphone", label: "Phone", icon: Smartphone, keywords: "mobile plan sim contract" },
      { name: "Monitor", label: "Monitor", icon: Monitor, keywords: "display screen desk setup" },
      { name: "Headphones", label: "Headphones", icon: Headphones, keywords: "audio music gear" },
      { name: "Wifi", label: "Internet", icon: Wifi, keywords: "broadband fibre connection bill" },
      { name: "Cpu", label: "Hardware", icon: Cpu, keywords: "pc build components tech" },
      { name: "Keyboard", label: "Keyboard", icon: Keyboard, keywords: "peripheral typing desk setup" },
      { name: "Mouse", label: "Mouse", icon: Mouse, keywords: "peripheral desk setup" },
      { name: "HardDrive", label: "Storage", icon: HardDrive, keywords: "disk backup ssd nas" },
      { name: "Server", label: "Server", icon: Server, keywords: "hosting vps rack infrastructure" },
      { name: "Database", label: "Database", icon: Database, keywords: "storage sql hosting" },
      { name: "Cloud", label: "Cloud", icon: Cloud, keywords: "icloud dropbox storage subscription" },
      { name: "Code", label: "Software", icon: Code, keywords: "development licence ide app" },
      { name: "Terminal", label: "Developer tools", icon: Terminal, keywords: "cli shell programming" },
      { name: "GitBranch", label: "Repositories", icon: GitBranch, keywords: "github version control developer" },
      { name: "Printer", label: "Printing", icon: Printer, keywords: "ink paper office" },
      { name: "BatteryCharging", label: "Charging", icon: BatteryCharging, keywords: "power battery ev" },
      { name: "BrainCircuit", label: "AI tools", icon: BrainCircuit, keywords: "machine learning subscription assistant" },
    ],
  },
  {
    id: "education",
    label: "Education",
    icons: [
      { name: "Book", label: "Books", icon: Book, keywords: "reading study literature" },
      { name: "GraduationCap", label: "Tuition", icon: GraduationCap, keywords: "school university course degree fees" },
      { name: "Pencil", label: "Lessons", icon: Pencil, keywords: "class tutoring study writing" },
      { name: "NotebookPen", label: "Courses", icon: NotebookPen, keywords: "training notes workshop learning" },
      { name: "Backpack", label: "School", icon: Backpack, keywords: "kids supplies term college" },
      { name: "School", label: "School", icon: School, keywords: "term fees children education" },
      { name: "University", label: "University", icon: University, keywords: "campus degree tuition" },
      { name: "Library", label: "Library", icon: Library, keywords: "books membership study" },
      { name: "Presentation", label: "Workshop", icon: Presentation, keywords: "seminar training talk" },
      { name: "ClipboardList", label: "Exams", icon: ClipboardList, keywords: "assessment certification test" },
      { name: "FileText", label: "Documents", icon: FileText, keywords: "paperwork admin certificate" },
    ],
  },
  {
    id: "travel",
    label: "Travel",
    icons: [
      { name: "Hotel", label: "Hotel", icon: Hotel, keywords: "stay accommodation booking room" },
      { name: "Bed", label: "Accommodation", icon: Bed, keywords: "airbnb hostel night stay" },
      { name: "Map", label: "Trips", icon: MapIcon, keywords: "travel journey holiday route" },
      { name: "MapPinned", label: "Destination", icon: MapPinned, keywords: "location place travel visit" },
      { name: "Luggage", label: "Luggage", icon: Luggage, keywords: "suitcase baggage packing trip" },
      { name: "Compass", label: "Exploring", icon: Compass, keywords: "adventure discover navigate" },
      { name: "TreePalm", label: "Holiday", icon: TreePalm, keywords: "vacation beach summer resort" },
      { name: "Tent", label: "Camping", icon: Tent, keywords: "outdoors festival nature" },
      { name: "Flag", label: "Country", icon: Flag, keywords: "nation destination abroad" },
      { name: "Umbrella", label: "Beach", icon: Umbrella, keywords: "holiday sun resort" },
      { name: "Sun", label: "Summer", icon: Sun, keywords: "sunshine holiday season" },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    icons: [
      { name: "CreditCard", label: "Card", icon: CreditCard, keywords: "payment subscription debit visa" },
      { name: "Banknote", label: "Cash", icon: Banknote, keywords: "money notes salary income" },
      { name: "Landmark", label: "Bank", icon: Landmark, keywords: "banking account institution tax" },
      { name: "PiggyBank", label: "Savings", icon: PiggyBank, keywords: "save fund reserve deposit" },
      { name: "Wallet", label: "Wallet", icon: Wallet, keywords: "pocket money spending balance" },
      { name: "HandCoins", label: "Fees", icon: HandCoins, keywords: "charges cost payment lending" },
      { name: "ChartLine", label: "Investing", icon: ChartLine, keywords: "stocks portfolio growth returns" },
      { name: "ShoppingBag", label: "Shopping", icon: ShoppingBag, keywords: "retail purchase store clothes" },
      { name: "Coins", label: "Coins", icon: Coins, keywords: "change cash small money" },
      { name: "Bitcoin", label: "Crypto", icon: Bitcoin, keywords: "bitcoin wallet exchange" },
      { name: "DollarSign", label: "Dollars", icon: DollarSign, keywords: "usd currency exchange" },
      { name: "Euro", label: "Euros", icon: Euro, keywords: "eur currency exchange" },
      { name: "ChartPie", label: "Allocation", icon: ChartPie, keywords: "split breakdown portfolio" },
      { name: "ChartColumn", label: "Reports", icon: ChartColumn, keywords: "statistics analysis figures" },
      { name: "Calculator", label: "Accounting", icon: Calculator, keywords: "tax bookkeeping figures" },
      { name: "Percent", label: "Interest", icon: Percent, keywords: "rate discount apr" },
    ],
  },
  {
    id: "personal",
    label: "Personal",
    icons: [
      { name: "User", label: "Personal", icon: User, keywords: "me myself individual" },
      { name: "Users", label: "Family", icon: Users, keywords: "shared household group friends" },
      { name: "Heart", label: "Wellbeing", icon: Heart, keywords: "self care love wellness" },
      { name: "HeartPulse", label: "Health", icon: HeartPulse, keywords: "medical insurance fitness checkup" },
      { name: "Pill", label: "Medication", icon: Pill, keywords: "pharmacy prescription health" },
      { name: "Stethoscope", label: "Doctor", icon: Stethoscope, keywords: "clinic medical appointment" },
      { name: "Scissors", label: "Grooming", icon: Scissors, keywords: "haircut barber salon beauty" },
      { name: "Gift", label: "Gifts", icon: Gift, keywords: "present birthday celebration" },
      { name: "PawPrint", label: "Pets", icon: PawPrint, keywords: "dog cat vet animal" },
      { name: "Watch", label: "Watch", icon: Watch, keywords: "wearable accessory time" },
      { name: "Shirt", label: "Clothing", icon: Shirt, keywords: "clothes fashion wardrobe" },
      { name: "Glasses", label: "Eyewear", icon: Glasses, keywords: "optician glasses lenses" },
      { name: "Baby", label: "Childcare", icon: Baby, keywords: "nursery kids baby" },
      { name: "Dog", label: "Dog", icon: Dog, keywords: "pet vet walk" },
      { name: "Cat", label: "Cat", icon: Cat, keywords: "pet vet litter" },
    ],
  },
  {
    id: "language",
    label: "Language & culture",
    icons: [
      { name: "Languages", label: "Languages", icon: Languages, keywords: "translation lessons arabic french spanish" },
      { name: "Globe", label: "Culture", icon: Globe, keywords: "world international global abroad" },
      { name: "BookOpen", label: "Reading", icon: BookOpen, keywords: "study literature learning library" },
      { name: "Speech", label: "Conversation", icon: Speech, keywords: "speaking practice tutor class arabic french conversation partner" },
      { name: "BookA", label: "Vocabulary", icon: BookA, keywords: "dictionary alphabet arabic script characters flashcards" },
      { name: "Feather", label: "Calligraphy", icon: Feather, keywords: "arabic script handwriting brush pen" },
      { name: "ScrollText", label: "Literature", icon: ScrollText, keywords: "poetry text classic reading" },
      { name: "BookMarked", label: "Study", icon: BookMarked, keywords: "textbook course revision" },
      { name: "Drama", label: "Theatre", icon: Drama, keywords: "play stage performance comedie theatre" },
      { name: "Theater", label: "Opera", icon: Theater, keywords: "concert hall stage ballet performance" },
      { name: "Amphora", label: "Museum", icon: Amphora, keywords: "gallery exhibition antiquities collection" },
      { name: "Castle", label: "Heritage", icon: Castle, keywords: "chateau monument historic visit" },
      { name: "Church", label: "Architecture", icon: Church, keywords: "cathedral monument visit sightseeing" },
      { name: "Pyramid", label: "Antiquity", icon: Pyramid, keywords: "archaeology ancient history museum" },
      { name: "Newspaper", label: "News", icon: Newspaper, keywords: "press subscription magazine le monde" },
      { name: "Quote", label: "Writing", icon: Quote, keywords: "essay journal blog author" },
      { name: "MessageSquareQuote", label: "Translation", icon: MessageSquareQuote, keywords: "interpret subtitles language service" },
      { name: "Piano", label: "Piano", icon: Piano, keywords: "lessons keyboard music conservatoire" },
      { name: "Music4", label: "Sheet music", icon: Music4, keywords: "score lessons practice theory" },
      { name: "Brush", label: "Painting", icon: Brush, keywords: "art class studio canvas" },
      { name: "PaintRoller", label: "Decorating", icon: PaintRoller, keywords: "diy interior paint" },
      { name: "Origami", label: "Craft", icon: Origami, keywords: "paper hobby making model" },
      { name: "Stamp", label: "Collecting", icon: Stamp, keywords: "philately hobby collection" },
      { name: "Aperture", label: "Photography", icon: Aperture, keywords: "lens camera club printing" },
      { name: "Images", label: "Prints", icon: Images, keywords: "gallery framing photo album" },
      { name: "Sparkles", label: "Other", icon: Sparkles, keywords: "misc general anything" },
    ],
  },
  {
    id: "gaming",
    label: "Gaming",
    icons: [
      { name: "Dices", label: "Board games", icon: Dices, keywords: "tabletop dice night rpg" },
      { name: "Puzzle", label: "Puzzle", icon: Puzzle, keywords: "brain game hobby" },
      { name: "Joystick", label: "Arcade", icon: Joystick, keywords: "controller retro arcade stick" },
      { name: "Bot", label: "AI", icon: Bot, keywords: "assistant bot subscription copilot" },
      { name: "Rocket", label: "Space sim", icon: Rocket, keywords: "launch rocket simulator elite" },
    ],
  },
  {
    id: "aviation",
    label: "Aviation",
    icons: [
      { name: "PlaneTakeoff", label: "Departure", icon: PlaneTakeoff, keywords: "takeoff flight outbound airport" },
      { name: "PlaneLanding", label: "Arrival", icon: PlaneLanding, keywords: "landing flight inbound airport" },
      { name: "TowerControl", label: "Air traffic", icon: TowerControl, keywords: "atc tower control airport" },
      { name: "Radar", label: "Radar", icon: Radar, keywords: "atc scope traffic vatsim" },
      { name: "Navigation", label: "Navigation", icon: Navigation, keywords: "heading route waypoint gps" },
      { name: "Route", label: "Flight plan", icon: Route, keywords: "route leg waypoint navlog" },
      { name: "Gauge", label: "Instruments", icon: Gauge, keywords: "airspeed panel cockpit avionics" },
      { name: "Satellite", label: "Satellite", icon: Satellite, keywords: "gps comms navigation" },
      { name: "Radio", label: "Radio", icon: Radio, keywords: "comms frequency atc headset" },
      { name: "Wind", label: "Weather", icon: Wind, keywords: "metar wind conditions" },
      { name: "CloudSun", label: "Forecast", icon: CloudSun, keywords: "weather metar taf conditions" },
      { name: "Anchor", label: "Marine", icon: Anchor, keywords: "harbour port boat" },
      { name: "Signpost", label: "Waypoint", icon: Signpost, keywords: "fix intersection navaid vor" },
      { name: "Locate", label: "Position", icon: Locate, keywords: "gps location transponder squawk" },
      { name: "Telescope", label: "Observation", icon: Telescope, keywords: "spotting sky watching" },
      { name: "Orbit", label: "Holding", icon: Orbit, keywords: "hold pattern circuit stack" },
      { name: "Earth", label: "Long haul", icon: Earth, keywords: "intercontinental world route ultra long range" },
      { name: "Sunset", label: "Night flight", icon: Sunset, keywords: "evening dusk time of day" },
    ],
  },
  {
    /*
     * Flight simulation.
     *
     * Deliberately generic shapes rather than brand marks. Every name in the
     * brief — MSFS, X-Plane, Navigraph, iniBuilds, PESIM, Azur Poly, Contrail,
     * Thrustmaster, Winwing, Honeycomb — is a trademark, and a hand-drawn
     * approximation of somebody's logo is both worse than their own and
     * misleading about who made it. The app already has the right answer for
     * a brand: give the wishlist item the maker's site and it uses their real
     * icon, which is the point of the separate brand link. These cover the
     * *kinds* of thing, which is what the picker is for — and the keywords are
     * the product names, so searching "winwing" or "navigraph" lands on the
     * right shape.
     */
    id: "flightsim",
    label: "Flight simulation",
    icons: [
      { name: "Joystick", label: "Yoke & stick", icon: Joystick, keywords: "yoke sidestick honeycomb alpha bravo thrustmaster winwing controller" },
      { name: "SlidersVertical", label: "Throttle quadrant", icon: SlidersVertical, keywords: "throttle levers quadrant bravo tca winwing thrust" },
      { name: "Footprints", label: "Rudder pedals", icon: Footprints, keywords: "rudder pedals toe brakes crosswind thrustmaster" },
      { name: "MonitorSpeaker", label: "Sim rig", icon: MonitorSpeaker, keywords: "cockpit rig setup home simulator desk" },
      { name: "Headset", label: "Headset", icon: Headset, keywords: "comms atc vatsim voice pilot" },
      { name: "Waypoints", label: "Navigation data", icon: Waypoints, keywords: "navigraph airac charts fixes navdata subscription" },
      { name: "Layers", label: "Scenery", icon: Layers, keywords: "orthos mesh photogrammetry addon terrain" },
      { name: "Boxes", label: "Aircraft add-on", icon: Boxes, keywords: "inibuilds pmdg fenix aircraft module payware a350 a320 a330" },
      { name: "Milestone", label: "Airport add-on", icon: Milestone, keywords: "pesim scenery airport terminal gate cdg" },
      { name: "Cctv", label: "Ground services", icon: Cctv, keywords: "gsx pushback jetway handling" },
      { name: "Crosshair", label: "Approach", icon: Crosshair, keywords: "ils approach minima autoland precision" },
      { name: "ScanEye", label: "Traffic", icon: ScanEye, keywords: "vatsim ivao online network traffic" },
      { name: "Antenna", label: "Comms", icon: Antenna, keywords: "vhf frequency atc radio pilot" },
      { name: "Cog", label: "Systems", icon: Cog, keywords: "failures avionics systems study level" },
      { name: "Fan", label: "Engines", icon: Fan, keywords: "turbofan thrust n1 engine trent" },
      { name: "Thermometer", label: "Conditions", icon: Thermometer, keywords: "oat temperature icing metar" },
      { name: "Sunrise", label: "Dawn departure", icon: Sunrise, keywords: "early morning flight time of day" },
      { name: "Binoculars", label: "Spotting", icon: Binoculars, keywords: "planespotting airport watching photography" },
      { name: "Ruler", label: "Charts", icon: Ruler, keywords: "plates jeppesen approach chart plotting" },
      { name: "Cable", label: "Wiring", icon: Cable, keywords: "usb hub peripherals rig cables" },
      { name: "Usb", label: "Peripherals", icon: Usb, keywords: "controller hardware connection device" },
      { name: "MemoryStick", label: "Memory", icon: MemoryStick, keywords: "ram upgrade pc build performance" },
      { name: "Webcam", label: "Streaming rig", icon: Webcam, keywords: "camera capture broadcast twitch" },
    ],
  },
  {
    id: "shopping",
    label: "Shopping & services",
    icons: [
      { name: "Store", label: "Shop", icon: Store, keywords: "retailer seller boutique" },
      { name: "Package", label: "Delivery", icon: Package, keywords: "parcel order shipping" },
      { name: "Truck", label: "Shipping", icon: Truck, keywords: "courier freight postage" },
      { name: "Receipt", label: "Receipt", icon: Receipt, keywords: "invoice bill proof" },
      { name: "Repeat", label: "Subscription", icon: Repeat, keywords: "recurring renewal monthly plan" },
      { name: "Tag", label: "Price", icon: Tag, keywords: "discount label sale" },
      { name: "Bookmark", label: "Saved", icon: Bookmark, keywords: "wishlist later shortlist" },
      { name: "Handshake", label: "Services", icon: Handshake, keywords: "contract agreement provider" },
      { name: "Briefcase", label: "Work", icon: Briefcase, keywords: "business professional expenses" },
    ],
  },
  {
    id: "outdoors",
    label: "Outdoors",
    icons: [
      { name: "Trees", label: "Nature", icon: Trees, keywords: "forest park outdoors walk" },
      { name: "Flower", label: "Flowers", icon: Flower, keywords: "florist plants gift" },
      { name: "Sprout", label: "Growing", icon: Sprout, keywords: "seeds gardening plants" },
      { name: "Recycle", label: "Recycling", icon: Recycle, keywords: "waste eco environment" },
      { name: "Bird", label: "Wildlife", icon: Bird, keywords: "birdwatching nature outdoors" },
    ],
  },
];

/** Shown when an activity has no icon, or names an icon this build does not know. */
export const FALLBACK_ICON: LucideIcon = Circle;

/**
 * Name → option, for resolving a stored icon.
 *
 * An icon may legitimately appear in more than one group: a joystick is an
 * arcade stick and it is a sidestick, and someone looking under "Gaming" and
 * someone looking under "Flight simulation" should both find it. The groups
 * are a way of browsing, not a partition.
 *
 * The first occurrence wins, so the label and keywords a stored name resolves
 * to are stable and do not depend on the order the groups happen to be
 * declared in. `Map` would otherwise keep the *last*, which is the one nobody
 * chose deliberately.
 */
const ICON_INDEX: Map<string, IconOption> = new Map();
for (const option of ICON_CATEGORIES.flatMap((category) => category.icons)) {
  if (!ICON_INDEX.has(option.name)) ICON_INDEX.set(option.name, option);
}

export const ICON_COUNT = ICON_INDEX.size;

/** Every icon name this picker can offer, in display order. */
export function iconNames(): string[] {
  return Array.from(ICON_INDEX.keys());
}

/** Looks up an icon component by stored name. Unknown names never throw. */
export function resolveIcon(name: string | null | undefined): LucideIcon {
  if (!name) return FALLBACK_ICON;
  return ICON_INDEX.get(name)?.icon ?? FALLBACK_ICON;
}

/** The human label for a stored icon name, for tooltips and summaries. */
export function iconLabel(name: string | null | undefined): string {
  if (!name) return "No icon";
  return ICON_INDEX.get(name)?.label ?? name;
}

interface ActivityIconProps {
  name?: string | null;
  size?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
}

/** Renders a stored icon name, falling back safely when the name is unknown. */
export const ActivityIcon: React.FC<ActivityIconProps> = ({ name, size = 18, color, strokeWidth = 1.9, className }) => {
  const Icon = resolveIcon(name);
  return <Icon size={size} color={color} strokeWidth={strokeWidth} className={className} aria-hidden="true" />;
};

interface IconPickerProps {
  value?: string;
  onChange: (name: string | undefined) => void;
  /** Tints the preview so the picker matches the card it is editing. */
  accent?: string;
  label?: string;
  disabled?: boolean;
}

const COLUMNS = 5;

export const IconPicker: React.FC<IconPickerProps> = ({ value, onChange, accent, label = "Icon", disabled }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [shift, setShift] = useState(0);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const groups = useMemo(() => filterCategories(query), [query]);
  const flat = useMemo(() => groups.flatMap((group) => group.icons), [groups]);

  const close = useCallback(
    (returnFocus = true) => {
      setOpen(false);
      setQuery("");
      if (returnFocus) triggerRef.current?.focus();
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    // Start on the current selection so arrow keys continue from where the
    // user already is rather than jumping to the top of the list.
    const index = flat.findIndex((option) => option.name === value);
    setActiveIndex(index >= 0 ? index : 0);
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [open, close]);

  useEffect(() => {
    if (activeIndex >= flat.length) setActiveIndex(flat.length > 0 ? flat.length - 1 : 0);
  }, [flat.length, activeIndex]);

  // Nudge the panel back inside the viewport when the field sits near the right
  // edge. The offset is derived from the *trigger*, which never moves, so this
  // settles in one pass instead of oscillating against its own correction.
  useLayoutEffect(() => {
    if (!open) {
      setShift(0);
      return;
    }
    const wrapper = wrapperRef.current;
    const panel = panelRef.current;
    if (!wrapper || !panel) return;
    const margin = 8;
    const viewport = document.documentElement.clientWidth;
    const naturalLeft = wrapper.getBoundingClientRect().left;
    const overflowRight = naturalLeft + panel.offsetWidth - (viewport - margin);
    setShift(overflowRight > 0 ? -Math.min(overflowRight, Math.max(0, naturalLeft - margin)) : 0);
  }, [open, query]);

  const focusOption = (index: number) => {
    const clamped = Math.max(0, Math.min(index, flat.length - 1));
    setActiveIndex(clamped);
    optionRefs.current[clamped]?.focus();
  };

  const select = (name: string | undefined) => {
    onChange(name);
    close();
  };

  const onGridKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (flat.length === 0) return;
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        focusOption(activeIndex + 1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        focusOption(activeIndex - 1);
        break;
      case "ArrowDown":
        event.preventDefault();
        focusOption(activeIndex + COLUMNS);
        break;
      case "ArrowUp":
        event.preventDefault();
        if (activeIndex < COLUMNS) searchRef.current?.focus();
        else focusOption(activeIndex - COLUMNS);
        break;
      case "Home":
        event.preventDefault();
        focusOption(0);
        break;
      case "End":
        event.preventDefault();
        focusOption(flat.length - 1);
        break;
      case "Escape":
        event.preventDefault();
        close();
        break;
      default:
        break;
    }
  };

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "ArrowDown" || (event.key === "Enter" && flat.length > 0)) {
      event.preventDefault();
      focusOption(event.key === "Enter" ? activeIndex : 0);
    }
  };

  const selected = value ? ICON_INDEX.get(value) : undefined;
  const accentColor = accent || "var(--accent)";
  let optionCursor = -1;

  return (
    <div ref={wrapperRef} style={{ position: "relative", minWidth: 0 }}>
      <button
        ref={triggerRef}
        type="button"
        className="btn btn-secondary"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${iconLabel(value)}`}
        style={{ width: "100%", justifyContent: "flex-start", gap: 10, minWidth: 0, overflow: "hidden" }}
      >
        <span
          aria-hidden="true"
          style={{
            display: "grid",
            placeItems: "center",
            width: 24,
            height: 24,
            flex: "0 0 auto",
            borderRadius: 8,
            background: tint(accentColor, 0.16),
            color: accentColor,
          }}
        >
          <ActivityIcon name={value} size={15} color="currentColor" />
        </span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected ? selected.label : value ? value : "Choose icon"}
        </span>
      </button>

      {open && (
        <div
          ref={panelRef}
          style={{
            position: "absolute",
            zIndex: 50,
            top: "calc(100% + 6px)",
            left: shift,
            width: "min(300px, calc(100vw - 40px))",
            maxHeight: 320,
            overflowY: "auto",
            overscrollBehavior: "contain",
            padding: 10,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
              <Search
                size={14}
                aria-hidden="true"
                style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }}
              />
              <input
                ref={searchRef}
                className="input"
                type="search"
                value={query}
                placeholder="Search icons"
                aria-label="Search icons"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onSearchKeyDown}
                style={{ height: 34, paddingLeft: 28, fontSize: "0.875rem" }}
              />
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-icon"
              onClick={() => close()}
              aria-label="Close icon picker"
            >
              <X size={14} />
            </button>
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => select(undefined)}
            style={{ width: "100%", justifyContent: "flex-start", marginBottom: 6 }}
          >
            <Circle size={14} /> No icon
          </button>

          {flat.length === 0 ? (
            <p className="text-caption" style={{ margin: "10px 4px" }}>
              No icon matches “{query}”.
            </p>
          ) : (
            <div role="listbox" aria-label="Activity icons" onKeyDown={onGridKeyDown}>
              {groups.map((group) => (
                <div key={group.id} style={{ marginBottom: 10 }}>
                  <div className="text-footnote" style={{ marginBottom: 6 }}>
                    {group.label}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))`, gap: 4 }}>
                    {group.icons.map((option) => {
                      optionCursor += 1;
                      const index = optionCursor;
                      const isSelected = option.name === value;
                      return (
                        <button
                          // Scoped to the group: the same icon can appear in two,
                          // and a bare name would collide as a React key.
                          key={`${group.id}-${option.name}`}
                          ref={(node) => {
                            optionRefs.current[index] = node;
                          }}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          aria-label={option.label}
                          title={option.label}
                          tabIndex={index === activeIndex ? 0 : -1}
                          onFocus={() => setActiveIndex(index)}
                          onClick={() => select(option.name)}
                          style={{
                            display: "grid",
                            placeItems: "center",
                            aspectRatio: "1 / 1",
                            minWidth: 0,
                            padding: 0,
                            borderRadius: "var(--radius-sm)",
                            cursor: "pointer",
                            color: isSelected ? accentColor : "var(--text-secondary)",
                            background: isSelected ? tint(accentColor, 0.16) : "transparent",
                            border: `1px solid ${isSelected ? tint(accentColor, 0.5) : "transparent"}`,
                          }}
                        >
                          <option.icon size={17} strokeWidth={1.9} aria-hidden="true" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface ColorPickerProps {
  value?: string;
  onChange: (color: string | undefined) => void;
  disabled?: boolean;
}

/** Curated accents that stay legible as a tint in both light and dark themes. */
export const ACTIVITY_COLORS = [
  "#0071E3",
  "#5E5CE6",
  "#AF52DE",
  "#FF375F",
  "#FF9500",
  "#FFCC00",
  "#34C759",
  "#00C7BE",
  "#64748B",
];

export const ColorPicker: React.FC<ColorPickerProps> = ({ value, onChange, disabled }) => (
  <div role="group" aria-label="Activity colour" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
    <button
      type="button"
      onClick={() => onChange(undefined)}
      disabled={disabled}
      aria-label="No colour"
      aria-pressed={!value}
      title="No colour"
      style={{ ...swatchStyle, background: "var(--bg-inset)", borderColor: !value ? "var(--text-primary)" : "var(--border)" }}
    >
      {!value && <X size={12} color="var(--text-secondary)" aria-hidden="true" />}
    </button>
    {ACTIVITY_COLORS.map((color) => (
      <button
        key={color}
        type="button"
        onClick={() => onChange(color)}
        disabled={disabled}
        aria-label={`Colour ${color}`}
        aria-pressed={value === color}
        title={color}
        style={{
          ...swatchStyle,
          background: color,
          borderColor: value === color ? "var(--text-primary)" : "transparent",
        }}
      >
        {value === color && <Check size={12} color="#FFFFFF" aria-hidden="true" />}
      </button>
    ))}
    <label
      className="text-caption"
      style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: disabled ? "default" : "pointer" }}
    >
      <input
        type="color"
        value={value && /^#[0-9a-f]{6}$/i.test(value) ? value : "#0071E3"}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-label="Custom colour"
        style={{ width: 26, height: 26, padding: 0, border: "1px solid var(--border)", borderRadius: 8, background: "transparent" }}
      />
      Custom
    </label>
  </div>
);

const swatchStyle: React.CSSProperties = {
  display: "grid",
  placeItems: "center",
  width: 26,
  height: 26,
  flex: "0 0 auto",
  padding: 0,
  borderRadius: "var(--radius-full)",
  border: "2px solid transparent",
  cursor: "pointer",
};

/**
 * A translucent version of an accent colour.
 *
 * Hex accents become rgba so the tint composites over whatever the theme puts
 * behind it — the same swatch reads correctly on a light and a dark surface.
 * Anything else (a CSS variable, a named colour) goes through `color-mix`,
 * which keeps the same behaviour without parsing.
 */
export function tint(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!hex) return `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;
  let digits = hex[1];
  if (digits.length === 3) digits = digits.split("").map((char) => char + char).join("");
  const red = parseInt(digits.slice(0, 2), 16);
  const green = parseInt(digits.slice(2, 4), 16);
  const blue = parseInt(digits.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/**
 * An accent adjusted to stay readable as a foreground colour.
 *
 * Mixing toward `--text-primary` darkens the accent on a light theme and
 * lightens it on a dark one, so a pale yellow never turns into invisible text.
 * Browsers without `color-mix` drop the declaration and inherit the theme's own
 * text colour, which is readable by definition.
 */
export function readableAccent(color: string): string {
  return `color-mix(in srgb, ${color} 76%, var(--text-primary))`;
}

function filterCategories(query: string): IconCategory[] {
  const term = query.trim().toLowerCase();
  if (!term) return ICON_CATEGORIES;
  const terms = term.split(/\s+/);
  return ICON_CATEGORIES.map((category) => ({
    ...category,
    icons: category.icons.filter((option) => {
      const haystack = `${option.name} ${option.label} ${option.keywords ?? ""} ${category.label}`.toLowerCase();
      return terms.every((part) => haystack.includes(part));
    }),
  })).filter((category) => category.icons.length > 0);
}

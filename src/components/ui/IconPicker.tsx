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
      { name: "Speech", label: "Conversation", icon: Speech, keywords: "speaking practice tutor class" },
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

const ICON_INDEX: Map<string, IconOption> = new Map(
  ICON_CATEGORIES.flatMap((category) => category.icons).map((option) => [option.name, option]),
);

export const ICON_COUNT = ICON_INDEX.size;

/** Every icon name this picker can offer, in display order. */
export function iconNames(): string[] {
  return Array.from(ICON_INDEX.keys());
}

/** Looks up an icon component by stored name. Unknown names never throw. */
const isUrl = (name: string | null | undefined) => {
  if (!name) return false;
  return /^https?:\/\//i.test(name) || /^data:/i.test(name);
};

export function resolveIcon(name: string | null | undefined): LucideIcon {
  if (!name) return FALLBACK_ICON;
  if (isUrl(name)) return FALLBACK_ICON; // URLs are not lucide icons
  return ICON_INDEX.get(name)?.icon ?? FALLBACK_ICON;
}

/** The human label for a stored icon name, for tooltips and summaries. */
export function iconLabel(name: string | null | undefined): string {
  if (!name) return "No icon";
  if (isUrl(name)) {
    try {
      const url = new URL(name);
      return `Custom icon (${url.hostname})`;
    } catch (e) {
      return "Custom icon";
    }
  }
  return ICON_INDEX.get(name)?.label ?? name;
}

interface ActivityIconProps {
  name?: string | null;
  size?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
}

/** Renders a stored icon name or a custom image URL, falling back safely when unknown. */
export const ActivityIcon: React.FC<ActivityIconProps> = ({ name, size = 18, color, strokeWidth = 1.9, className }) => {
  if (isUrl(name)) {
    // Render an img for an explicit URL. Never expose a referrer.
    return (
      // eslint-disable-next-line jsx-a11y/img-redundant-alt
      <img
        src={name as string}
        alt="icon"
        width={size}
        height={size}
        style={{ display: "block", width: size, height: size, objectFit: "contain" }}
        referrerPolicy="no-referrer"
        onError={(e) => {
          // Replace the broken image with the fallback icon component.
          const el = e.currentTarget as HTMLImageElement;
          el.style.display = "none";
          // No further DOM mutation here; the parent will still show the
          // fallback icon because resolveIcon returns FALLBACK_ICON for URLs.
        }}
        aria-hidden="true"
      />
    );
  }
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

          {/* Custom URL input: allow entering an external image URL as the icon */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <input
              className="input"
              placeholder="Custom icon URL (https://...)"
              type="url"
              inputMode="url"
              aria-label="Custom icon URL"
              defaultValue={isUrl(value) ? value ?? "" : ""}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const input = e.currentTarget as HTMLInputElement;
                  const v = input.value.trim();
                  if (v) select(v);
                }
              }}
              style={{ flex: 1, minWidth: 0 }}
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                const input = panelRef.current?.querySelector<HTMLInputElement>("input[aria-label='Custom icon URL']");
                if (!input) return;
                const v = input.value.trim();
                if (!v) return;
                select(v);
              }}
            >
              Apply
            </button>
          </div>

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
                          key={option.name}
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

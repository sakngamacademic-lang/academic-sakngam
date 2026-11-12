"use client"

import type { CSSProperties } from "react"
import DishOrbitCarousel, { type Dish } from "@/components/ui/dish-orbit-carousel"

/*
 * Demo for DishOrbitCarousel — NOT routed in the app (Phase scope: component
 * integration only). To preview, temporarily render <Demo /> from a dev route.
 *
 * Photos: Unsplash stock (the same shots the original demo inlined as cut-out
 * WebP). They are loaded from images.unsplash.com as plain square crops, so
 * the plates are not transparent cut-outs here.
 */
const u = (id: string, size = 600) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${size}&h=${size}&q=80`

const IMG_STEAK = u("1659881981676-33ab127152c0")
const IMG_SALAD = u("1667657682263-86e924b34fd9")
const IMG_FISH = u("1685079258536-06d8253e862c")
const IMG_ORANGE = u("1685079244839-f9937fe388a3")
const IMG_EGG = u("1691480184494-d9f822edd4d1")
const IMG_ROOM = "https://images.unsplash.com/photo-1653971858474-4f2dfa7f4dc1?auto=format&fit=crop&w=1600&q=70"

const dishes: Dish[] = [
  {
    title: "Char grill",
    subtitle: "Ribeye",
    label: "Ribeye frites",
    image: IMG_STEAK,
    alt: "Grilled ribeye with fries, broccoli and a pot of ketchup on a dark plate",
    rating: 4.9,
    chef: "Chef Mara Lind",
    kitchen: "Ember Counter, Harbour St",
    description: "Dry-aged for 28 days, seared over charcoal and rested in brown butter. Thin fries, charred greens.",
    likes: 96,
    ingredients: ["Ribeye", "Fries", "Broccoli", "Green beans", "Smoked ketchup"],
    accent: "#f6a37c",
  },
  {
    title: "Garden",
    subtitle: "Salmon",
    label: "Garden salmon salad",
    image: IMG_SALAD,
    alt: "Leafy salad with cured salmon, avocado and cucumber on a white plate",
    rating: 4.3,
    chef: "Chef Teo Ashe",
    kitchen: "The Greenhouse Table",
    description: "Citrus-cured salmon over rocket, frisée and avocado, with cucumber ribbons and a dill dressing.",
    likes: 71,
    ingredients: ["Cured salmon", "Avocado", "Rocket", "Cucumber", "Dill"],
    accent: "#f2a6c6",
  },
  {
    title: "Black lentil",
    subtitle: "Sea bass",
    label: "Lentil sea bass",
    image: IMG_FISH,
    alt: "Seared sea bass with sesame on black lentils, a soft egg and carrots",
    rating: 4.6,
    chef: "Chef Ilse Noor",
    kitchen: "Saltwater Kitchen",
    description: "Crisp-skin sea bass on beluga lentils with a jammy egg, glazed carrots and a soy-honey jus.",
    likes: 88,
    ingredients: ["Sea bass", "Beluga lentils", "Soft egg", "Carrot", "Sesame"],
    accent: "#bcd98e",
  },
  {
    title: "Summer",
    subtitle: "Melon",
    label: "Summer melon salad",
    image: IMG_ORANGE,
    alt: "Melon and cured ham salad with rocket and cherry tomatoes on a white plate",
    rating: 4.5,
    chef: "Chef Rafa Okoye",
    kitchen: "Pergola Café",
    description: "Cantaloupe, cured ham and blistered tomatoes, tossed with rocket and a squeeze of lime.",
    likes: 64,
    ingredients: ["Cantaloupe", "Cured ham", "Cherry tomato", "Rocket", "Lime"],
    accent: "#f5d26a",
  },
  {
    title: "Sunny",
    subtitle: "Side up",
    label: "Sunny side up",
    image: IMG_EGG,
    alt: "A fried egg with a bright yolk on a white plate",
    rating: 4.7,
    chef: "Chef June Park",
    kitchen: "Morning Room",
    description: "One farm egg, basted in brown butter until the edges lace and the yolk just sets. Breakfast, done right.",
    likes: 120,
    ingredients: ["Farm egg", "Brown butter", "Sea salt", "Black pepper"],
    accent: "#9fcbe8",
  },
]

/** The component reads Tailwind-style --color-* variables; map them to this project's tokens. */
const themeVars = {
  "--color-background": "var(--background)",
  "--color-foreground": "var(--foreground)",
  "--color-primary": "var(--primary)",
  "--color-muted-foreground": "var(--muted-foreground)",
} as CSSProperties

export default function Demo() {
  return (
    <div style={themeVars}>
      <DishOrbitCarousel dishes={dishes} backdrop={IMG_ROOM} />
    </div>
  )
}

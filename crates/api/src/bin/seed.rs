//! Development seed data: one account with a couple of hundred records.
//!
//! Run it with `bash scripts/seed.sh`. It refuses to run when `APP_ENV` is
//! `production`, and it does nothing if the account already has records.
//!
//! The data is synthetic but plausible: real-ish titles, years, ratings and
//! tags, so the interface can be judged with something other than three rows.

use std::process::ExitCode;

use jey_api::auth::password::hash_password;
use jey_api::config::Config;
use jey_api::db::create_pool;
use jey_api::items::repo;
use jey_core::items::{ItemKind, ItemStatus, NewItem, validate};
use sqlx::PgPool;
use uuid::Uuid;

const SEED_EMAIL: &str = "seed@example.com";
const SEED_PASSWORD: &str = "correct horse battery";
const ITEM_COUNT: usize = 200;

const MOVIES: &[&str] = &[
    "Interstellar",
    "Arrival",
    "Blade Runner 2049",
    "The Grand Budapest Hotel",
    "Spirited Away",
    "Parasite",
    "Mad Max: Fury Road",
    "Everything Everywhere All at Once",
    "Дюна",
    "Сталкер",
];

const BOOKS: &[&str] = &[
    "Dune",
    "The Left Hand of Darkness",
    "Solaris",
    "Master and Margarita",
    "The Name of the Rose",
    "Hyperion",
    "Piranesi",
    "Roadside Picnic",
    "Пикник на обочине",
    "The Dispossessed",
];

const IMAGES: &[&str] = &[
    "Blue horses",
    "Night watch",
    "The Great Wave",
    "Wanderer above the Sea of Fog",
    "Composition VIII",
    "Girl with a Pearl Earring",
    "The Persistence of Memory",
    "Nighthawks",
    "Red Fuji",
    "The Kiss",
];

const OTHERS: &[&str] = &[
    "Kyoto trip notes",
    "Sourdough recipe",
    "Birdwatching list",
    "Concert setlist",
    "Reading plan 2027",
    "Lego lighthouse",
    "Board game night",
    "Ceramics course",
    "Podcast backlog",
    "Museum membership",
];

const AUTHORS: &[&str] = &[
    "Christopher Nolan",
    "Denis Villeneuve",
    "Frank Herbert",
    "Ursula K. Le Guin",
    "Andrei Tarkovsky",
    "Hayao Miyazaki",
    "Bong Joon-ho",
    "Ted Chiang",
];

#[tokio::main]
async fn main() -> ExitCode {
    match run().await {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("seed failed: {error}");
            ExitCode::FAILURE
        }
    }
}

async fn run() -> Result<(), Box<dyn std::error::Error>> {
    let config = Config::load()?;

    if config.is_production() {
        return Err("refusing to seed a production database".into());
    }

    let pool = create_pool(&config)?;
    let user_id = ensure_user(&pool).await?;

    let existing: i64 = sqlx::query_scalar("select count(*) from items where user_id = $1")
        .bind(user_id)
        .fetch_one(&pool)
        .await?;

    if existing > 0 {
        println!("account {SEED_EMAIL} already has {existing} records; nothing to do");
        return Ok(());
    }

    for index in 0..ITEM_COUNT {
        let item = build_item(index);
        validate::validate_new(&item).map_err(|error| format!("seed item {index}: {error}"))?;
        repo::create(&pool, user_id, None, &item).await?;
    }

    println!("seeded {ITEM_COUNT} records for {SEED_EMAIL}");
    println!("password: {SEED_PASSWORD}");
    println!("open http://localhost:3000 and log in");

    Ok(())
}

async fn ensure_user(pool: &PgPool) -> Result<Uuid, Box<dyn std::error::Error>> {
    if let Some(id) = sqlx::query_scalar::<_, Uuid>("select id from users where email = $1")
        .bind(SEED_EMAIL)
        .fetch_optional(pool)
        .await?
    {
        return Ok(id);
    }

    let id = Uuid::new_v4();
    let password_hash =
        hash_password(SEED_PASSWORD).map_err(|error| format!("hash password: {error}"))?;

    sqlx::query(
        "insert into users (id, email, password_hash, display_name, email_verified_at)
         values ($1, $2, $3, $4, now())",
    )
    .bind(id)
    .bind(SEED_EMAIL)
    .bind(password_hash)
    .bind("Seed account")
    .execute(pool)
    .await?;

    Ok(id)
}

fn build_item(index: usize) -> NewItem {
    let kind = match index % 4 {
        0 => ItemKind::Movie,
        1 => ItemKind::Book,
        2 => ItemKind::Image,
        _ => ItemKind::Other,
    };

    let base = match kind {
        ItemKind::Movie | ItemKind::Tv => MOVIES[index % MOVIES.len()],
        ItemKind::Book => BOOKS[index % BOOKS.len()],
        ItemKind::Image => IMAGES[index % IMAGES.len()],
        ItemKind::Other => OTHERS[index % OTHERS.len()],
    };

    // Films and pictures cannot be "in progress".
    let statuses: &[ItemStatus] = match kind {
        ItemKind::Movie | ItemKind::Image => {
            &[ItemStatus::Planned, ItemStatus::Done, ItemStatus::Dropped]
        }
        ItemKind::Tv | ItemKind::Book | ItemKind::Other => &[
            ItemStatus::Planned,
            ItemStatus::InProgress,
            ItemStatus::Done,
            ItemStatus::Dropped,
        ],
    };
    let status = statuses[index / 2 % statuses.len()];

    let rating = if index % 5 == 0 {
        None
    } else {
        Some((index % 10 + 1) as u8)
    };

    let year = match kind {
        ItemKind::Movie | ItemKind::Tv | ItemKind::Book => Some(1950 + (index * 7 % 76) as i32),
        _ => None,
    };

    let review = if index % 3 == 0 {
        Some(format!(
            "Заметка номер {}. Первый абзац текста.\nВторой абзац — тоже текст.",
            index + 1
        ))
    } else {
        None
    };

    NewItem {
        kind,
        title: format!("{base} #{:03}", index + 1),
        subtitle: (index % 4 != 3).then(|| AUTHORS[index % AUTHORS.len()].to_owned()),
        year,
        status,
        rating,
        review,
        source_url: None,
        external_source: None,
        external_id: None,
        details: None,
        public_hidden: false,
    }
}

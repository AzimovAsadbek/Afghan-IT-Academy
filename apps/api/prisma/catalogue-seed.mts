import { ALL_SUBJECTS, SUBJECTS, type SubjectKey } from '@afghan-it-academy/shared';

import type { CourseLevel, PrismaClient } from '../generated/prisma/index.js';

/**
 * Reference and demonstration data for the catalogue.
 *
 * Subjects are reference data the application depends on and are always seeded.
 * The courses below are sample content so the catalogue can be developed and
 * verified against something real; they are upserted by slug, so re-running is
 * safe and editing one here updates it rather than creating a duplicate.
 *
 * Real course content will come from the instructor platform. Until something
 * can author a course, seeded samples are the only way to exercise the read
 * path at all.
 */

const SUBJECT_ORDER: Readonly<Record<SubjectKey, number>> = {
  [SUBJECTS.IT]: 10,
  [SUBJECTS.ENGLISH]: 20,
  [SUBJECTS.AI]: 30,
};

/** The Prisma enum member names, which differ from the BCP 47 tags by a hyphen. */
const SEEDED_LOCALES = ['en', 'fa_AF', 'ps_AF'] as const;

type SeededLocale = (typeof SEEDED_LOCALES)[number];

interface SeedTranslation {
  readonly title: string;
  readonly summary: string;
  readonly description: string;
}

interface SeedCourse {
  readonly slug: string;
  readonly subject: SubjectKey;
  readonly level: CourseLevel;
  readonly estimatedMinutes: number;
  readonly published: boolean;
  /** Deliberately partial for one course, so the fallback path has real data. */
  readonly translations: Partial<Record<SeededLocale, SeedTranslation>>;
}

const COURSES: readonly SeedCourse[] = [
  {
    slug: 'web-development-foundations',
    subject: SUBJECTS.IT,
    level: 'BEGINNER',
    estimatedMinutes: 1_800,
    published: true,
    translations: {
      en: {
        title: 'Web Development Foundations',
        summary: 'Build and publish your first website using HTML, CSS and JavaScript.',
        description:
          'Start from nothing and finish with a website you have built and published yourself. You will learn how a page is structured, how it is styled, and how to make it respond to the person using it. No prior programming experience is assumed, and every example is small enough to work through on a phone.',
      },
      fa_AF: {
        title: 'مبانی توسعه‌ی وب',
        summary: 'اولین ویب‌سایت خود را با HTML، CSS و جاواسکریپت بسازید و نشر کنید.',
        description:
          'از صفر شروع کنید و با یک ویب‌سایت که خودتان ساخته و نشر کرده‌اید به پایان برسید. یاد می‌گیرید که یک صفحه چگونه ساختار می‌یابد، چگونه طراحی می‌شود و چگونه به کاربر پاسخ می‌دهد. هیچ تجربه‌ی قبلی برنامه‌نویسی لازم نیست و هر مثال آنقدر کوچک است که روی موبایل هم قابل کار باشد.',
      },
      ps_AF: {
        title: 'د ویب پراختیا بنسټونه',
        summary: 'خپله لومړۍ ویب‌پاڼه د HTML، CSS او جاواسکریپټ په مرسته جوړه او خپره کړئ.',
        description:
          'له سره پیل وکړئ او په پای کې یوه ویب‌پاڼه ولرئ چې پخپله مو جوړه او خپره کړې ده. زده به کړئ چې پاڼه څنګه جوړښت مومي، څنګه ډیزاین کېږي او څنګه کاروونکي ته ځواب وایي. مخکینۍ تجربه ته اړتیا نشته او هره بېلګه دومره وړه ده چې په موبایل کې هم پرې کار وشي.',
      },
    },
  },
  {
    slug: 'english-for-the-workplace',
    subject: SUBJECTS.ENGLISH,
    level: 'INTERMEDIATE',
    estimatedMinutes: 1_200,
    published: true,
    translations: {
      en: {
        title: 'English for the Workplace',
        summary: 'Write clear emails, join meetings and handle an interview in English.',
        description:
          'Practical English for the situations that decide whether you get hired and how you are treated once you are. You will practise writing a message a manager reads without effort, taking part in a meeting without losing the thread, and answering the questions an interviewer actually asks.',
      },
      fa_AF: {
        title: 'انگلیسی برای محیط کار',
        summary: 'ایمیل روشن بنویسید، در جلسات شرکت کنید و مصاحبه را به انگلیسی پیش ببرید.',
        description:
          'انگلیسی عملی برای همان موقعیت‌هایی که تعیین می‌کنند آیا استخدام می‌شوید و پس از آن چگونه با شما رفتار می‌شود. تمرین می‌کنید پیامی بنویسید که مدیر بدون زحمت بخواند، در جلسه شرکت کنید بدون آنکه رشته‌ی بحث را از دست بدهید، و به پرسش‌هایی پاسخ دهید که مصاحبه‌کننده واقعاً می‌پرسد.',
      },
      ps_AF: {
        title: 'د کار ځای لپاره انګلیسي',
        summary: 'روښانه بریښنالیک ولیکئ، په غونډو کې برخه واخلئ او مرکه په انګلیسي سرته ورسوئ.',
        description:
          'عملي انګلیسي د هغو حالتونو لپاره چې ټاکي ایا دنده ترلاسه کوئ او وروسته درسره څنګه چلند کېږي. تمرین به وکړئ چې داسې پیغام ولیکئ چې مدیر یې په اسانۍ ولولي، په غونډه کې برخه واخلئ او هغو پوښتنو ته ځواب ووایاست چې مرکه‌کوونکی یې واقعاً کوي.',
      },
    },
  },
  {
    slug: 'introduction-to-artificial-intelligence',
    subject: SUBJECTS.AI,
    level: 'BEGINNER',
    estimatedMinutes: 900,
    published: true,
    translations: {
      en: {
        title: 'Introduction to Artificial Intelligence',
        summary: 'Understand what AI can and cannot do, and use it well in your own work.',
        description:
          'A grounded introduction for people who keep hearing about AI and want to know what is actually true. You will learn where these systems are genuinely useful, where they fail in ways that are easy to miss, and how to use them as a tool without handing over judgement that should stay yours.',
      },
      fa_AF: {
        title: 'آشنایی با هوش مصنوعی',
        summary: 'بدانید هوش مصنوعی چه می‌تواند و چه نمی‌تواند، و آن را درست به کار ببرید.',
        description:
          'یک معرفی واقع‌بینانه برای کسانی که مدام درباره‌ی هوش مصنوعی می‌شنوند و می‌خواهند بدانند واقعاً چه چیزی درست است. یاد می‌گیرید این سیستم‌ها کجا واقعاً مفیدند، کجا به شکلی که به‌سادگی دیده نمی‌شود اشتباه می‌کنند، و چگونه از آن‌ها به‌عنوان ابزار استفاده کنید بدون آنکه قضاوتی را که باید نزد خودتان بماند واگذار کنید.',
      },
      // Pashto deliberately absent: the fallback path needs real data to
      // exercise, and a partially translated catalogue is the normal state of
      // any multilingual product mid-flight.
    },
  },
  {
    slug: 'databases-and-sql',
    subject: SUBJECTS.IT,
    level: 'INTERMEDIATE',
    estimatedMinutes: 1_500,
    published: true,
    translations: {
      en: {
        title: 'Databases and SQL',
        summary: 'Model data properly and query it without bringing the server down.',
        description:
          'How to store data so it stays correct, and how to ask questions of it that return quickly. Covers table design, the joins that matter, indexes and why the wrong query gets slow long before anyone notices.',
      },
      fa_AF: {
        title: 'دیتابیس و SQL',
        summary: 'داده را درست مدل کنید و طوری پرس‌وجو کنید که سرور از کار نیفتد.',
        description:
          'چگونه داده را طوری ذخیره کنید که درست بماند، و چگونه از آن پرسش‌هایی بپرسید که سریع پاسخ دهند. طراحی جدول، جوین‌هایی که اهمیت دارند، ایندکس‌ها و اینکه چرا پرس‌وجوی نادرست خیلی پیش از آنکه کسی متوجه شود کند می‌شود.',
      },
      ps_AF: {
        title: 'ډېټابیسونه او SQL',
        summary: 'ډېټا سمه ماډل کړئ او داسې پوښتنه ترې وکړئ چې سرور له کاره نه لوېږي.',
        description:
          'څنګه ډېټا داسې زېرمه کړئ چې سمه پاتې شي، او څنګه ترې داسې پوښتنې وکړئ چې ژر ځواب ورکړي. د جدول ډیزاین، هغه جوینونه چې اهمیت لري، اندکسونه او دا چې ولې ناسمه پوښتنه د چا له پام کېدو ډېر مخکې ورو کېږي.',
      },
    },
  },
  {
    slug: 'mobile-app-development',
    subject: SUBJECTS.IT,
    level: 'ADVANCED',
    estimatedMinutes: 2_400,
    published: false,
    translations: {
      en: {
        title: 'Mobile App Development',
        summary: 'Build a production mobile application end to end.',
        description:
          'Still being written. Present in the seed so the unpublished path has something to hide from anonymous callers and show to an instructor.',
      },
    },
  },
];

export async function seedCatalogue(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const key of ALL_SUBJECTS) {
      await tx.subject.upsert({
        where: { key },
        update: { sortOrder: SUBJECT_ORDER[key], isActive: true },
        create: { key, sortOrder: SUBJECT_ORDER[key] },
      });
    }

    for (const course of COURSES) {
      const subject = await tx.subject.findUniqueOrThrow({
        where: { key: course.subject },
        select: { id: true },
      });

      const data = {
        subjectId: subject.id,
        level: course.level,
        estimatedMinutes: course.estimatedMinutes,
        status: course.published ? ('PUBLISHED' as const) : ('DRAFT' as const),
        // Stable rather than now(): re-running the seed must not reshuffle the
        // catalogue order, which is sorted by this column.
        publishedAt: course.published ? new Date('2026-08-01T00:00:00.000Z') : null,
      };

      const row = await tx.course.upsert({
        where: { slug: course.slug },
        update: data,
        create: { slug: course.slug, ...data },
        select: { id: true },
      });

      // Iterating a typed list rather than Object.entries: entries widens the
      // key to string and loses which locales are actually possible, which is
      // exactly the thing the Locale enum exists to keep honest.
      for (const locale of SEEDED_LOCALES) {
        const text = course.translations[locale];
        if (text === undefined) continue;

        await tx.courseTranslation.upsert({
          where: { courseId_locale: { courseId: row.id, locale } },
          update: text,
          create: { courseId: row.id, locale, ...text },
        });
      }
    }
  });
}

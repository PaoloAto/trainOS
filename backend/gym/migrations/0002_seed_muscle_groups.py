from django.db import migrations

DEFAULT_MUSCLE_GROUPS = [
    "Chest",
    "Back",
    "Shoulders",
    "Biceps",
    "Triceps",
    "Quads",
    "Hamstrings",
    "Glutes",
    "Calves",
    "Core",
    "Forearms",
    "Full Body",
]


def seed_muscle_groups(apps, schema_editor):
    MuscleGroup = apps.get_model("gym", "MuscleGroup")
    for name in DEFAULT_MUSCLE_GROUPS:
        MuscleGroup.objects.get_or_create(name=name)


class Migration(migrations.Migration):
    dependencies = [
        ("gym", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_muscle_groups, migrations.RunPython.noop),
    ]
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("gym", "0003_exercisereference_user"),
    ]

    operations = [
        migrations.AddField(
            model_name="exercise",
            name="archived_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="exercise",
            name="is_archived",
            field=models.BooleanField(default=False),
        ),
    ]

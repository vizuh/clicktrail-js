"""Shared Django bootstrap for both integration test suites.

Both suites may run together in one pytest invocation; whoever configures
first must install a settings object that satisfies BOTH packages.
"""


def configure_django_for_tests():
    from django.conf import settings

    if settings.configured:
        return

    try:
        import wagtail  # noqa: F401

        has_wagtail = True
    except ImportError:
        has_wagtail = False

    installed_apps = [
        "django.contrib.contenttypes",
        "django.contrib.auth",
        "clicktrail_django",
    ]
    templates_libs = {
        "clicktrail": "clicktrail_django.templatetags.clicktrail",
    }
    if has_wagtail:
        installed_apps += [
            "wagtail",
            "wagtail.contrib.forms",
            "wagtail_clicktrail",
        ]

    import django

    settings.configure(
        DEBUG=True,
        SECRET_KEY="test-secret-key",
        DATABASES={},
        INSTALLED_APPS=installed_apps,
        TEMPLATES=[
            {
                "BACKEND": "django.template.backends.django.DjangoTemplates",
                "DIRS": [],
                "APP_DIRS": False,
                "OPTIONS": {"libraries": templates_libs},
            }
        ],
        USE_TZ=True,
        CLICKTRAIL_API_KEY="k-test",
        CLICKTRAIL_SITE_ID="s-test",
        CLICKTRAIL_ENDPOINT="https://ct.example.com",
    )
    django.setup()


def pytest_configure(config):
    configure_django_for_tests()

---
layout: page
title: Account and Email
parent: Using RSSMonster
nav_order: 14
---

# Account and Email

Open **Settings → Account** in the desktop interface to manage your password,
email address, and daily briefing delivery. Your username is read-only.

## Change your password

Enter the new password twice and save. Passwords must be 8–128 characters.
Leave both password fields blank to keep your current password. A password
change invalidates older login sessions and updates the credentials used for
Fever authentication, so reconnect other clients with the new credentials.

## Verify or change your email address

Email features depend on the operator enabling [SMTP]({% link email-configuration.md %}).
When enabled, new accounts need an email address, and existing users without a
verified address enter an enrollment flow when signing in.

Save the address in Account, then use **Send verification email** if necessary.
Follow the verification link sent to that mailbox. Changing your address requires
verification again. The status in Account shows whether the saved address is verified.

## Recover access

When email is enabled, use the password-recovery option on the sign-in screen.
Enter the address associated with your account and follow the reset link.
Request responses deliberately do not disclose whether an address belongs to an
account. Check spam folders if a message is missing; recovery requires a verified
address. Without email delivery, ask the instance administrator for assistance.

## Schedule briefing emails

After verification, enable **Email my daily briefing**, choose a delivery time,
and set a timezone such as `Europe/Amsterdam`. Choose whether to skip empty
briefings and select **Save changes**. Use **Send test daily briefing** to check
end-to-end delivery using your saved account and briefing configuration.

The server checks due schedules every five minutes and queues delivery, so the
chosen time is not an exact arrival guarantee. Scheduled digests are deduplicated
by your local calendar date. Delivery retries and the mail provider can add delay.
Disable the email option and save to stop future scheduled briefings.

The content follows [Daily Briefing]({% link daily-briefing.md %}) preferences. Browser
[Push notifications]({% link web-app-and-notifications.md %}) are configured separately.

## OIDC Account Email

For OIDC-only accounts, the email field is read-only and managed by the identity
provider. Verified provider email changes are applied on login; conflicting
addresses reject login without merging accounts. If the provider supplies no
verified email, required email enrollment remains available during sign-in. Local
accounts with a linked provider retain email editing for recovery. See
[OIDC Configuration]({% link oidc-configuration.md %}) for Google setup.

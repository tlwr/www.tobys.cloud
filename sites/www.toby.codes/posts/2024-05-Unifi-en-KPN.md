# Unifi en KPN

## KPN

In September 2023 verhuisde ik naar Rotterdam. Vanwege het enorme prijsverschil
tussen Amsterdam en Rotterdam verhuisde ik vanuit een (redelijk) klein
apartement naar een echte huis (met verdiepingen).

Dit vraagte vooral aanpassingen met de wifi...

KPN was al aangesloten en volgens de vorige bewoners werkte het gewoon goed. KPN was ook niet veel duurder dan andere aanbieders, dus de keuze viel op KPN.

Meegeleverd met de KPN zender (KPN Box 12) kwamen er twee SuperWifi
mesh-zendertjes. Dit leek wel een prima oplossing, maar was niet heel
betrouwbaar. Vaak had ik hoge latency vanuit de bovenste verdieping, en met een
ping naar de zender toe was het duidelijk dat de zendertjes moeite hadden om te
synchroniseren (vaak één of twee timeouts en toch later het antwoordbericht).

## Unifi

Na de zoveelste keer naar de kelder gelopen om de zender opnieuw op te starten,
was ik het zat.

_Wij zijn aan het verbouwen dus ik kan nog niet een hele mooie kast vol
dure IT-spullen neerzetten._

Ik kochte een paar [Unifi
Express](https://www.ui.com/eu/en/cloud-gateways/wifi-integrated/express):
één voor in de kelder en één voor boven (als mesh). De dradeloze verbindingen
werken tot nu toe heel goed, ik kan niet zeuren; mijn vriendin ook niet.

In het begin had ik die aangesloten als zender + mesh, met de KPN Box als
hoofdaansluiting. Maar dit zorge voor slechte IPv6 binnen het huis.

Zo'n meegeleverde zender is wel voordelend want hij sluit meestal van zelf aan.
Met Unifi is dit niet zo en je moet hem zelf de instellingen uitpuzzelen.

### Voorbereiden

Bij KPN (mijn producten) kan je IP vinden, bij voorbeeld:

```
https://mijn.kpn.com/#/producten/<product-id>/ipadres
```

Meestal krijg je een v4 en een v6 prefix van `/48`

IPv4 kan van zelf (PPPoE) ingesteld worden, maar dit adres heb je nodig voor IPv6.

### LAN

Voor het locale netwerk instellen: gebruik je eigen IPv6 cidr van Mijn KPN met
SLAAC

Unifi vereist minimaal `/64` voor SLAAC op LAN.

### WAN

Voor het WAN netwerk instellen:

* VLAN ID: 6
* QoS Tag: 1
* IPv4 met PPPoE (username en wachtwoord: internet)
* IPv6 met SLAAC (Prefix delegation, 48)

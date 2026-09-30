import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

void main() => runApp(const LifeFlowApp());

const brandBlue = Color(0xFF1261E8);
const ink = Color(0xFF182744);

class LifeFlowApp extends StatelessWidget {
  const LifeFlowApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'LifeFlow',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          useMaterial3: true,
          colorScheme: ColorScheme.fromSeed(seedColor: brandBlue),
          scaffoldBackgroundColor: const Color(0xFFF7F9FC),
          appBarTheme: const AppBarTheme(backgroundColor: Colors.white),
          textTheme: const TextTheme(
            headlineMedium: TextStyle(fontWeight: FontWeight.w800, color: ink),
            titleLarge: TextStyle(fontWeight: FontWeight.w700, color: ink),
          ),
        ),
        home: const CustomerScreen(),
      );
}

class CustomerScreen extends StatefulWidget {
  const CustomerScreen({super.key});
  @override
  State<CustomerScreen> createState() => _CustomerScreenState();
}

class _CustomerScreenState extends State<CustomerScreen> {
  static const baseUrl = String.fromEnvironment('API_BASE_URL',
      defaultValue: 'http://localhost:8000');
  static const token = String.fromEnvironment('DEMO_API_TOKEN');
  final http.Client _client = http.Client();
  List<dynamic> _customers = [];
  Map<String, dynamic>? _state;
  int _selected = 1;
  bool _busy = false;
  String? _error;
  Timer? _poller;

  @override
  void initState() {
    super.initState();
    _load(initial: true);
    _poller = Timer.periodic(const Duration(seconds: 5), (_) {
      if (!_busy && _state != null) _load(silent: true);
    });
  }

  @override
  void dispose() {
    _poller?.cancel();
    _client.close();
    super.dispose();
  }

  Future<dynamic> _request(String path,
      {String? post, Map<String, dynamic>? body}) async {
    final uri = Uri.parse('$baseUrl/api$path');
    final headers = {'Content-Type': 'application/json', 'X-Demo-Token': token};
    final response = await (post == null
            ? _client.get(uri, headers: headers)
            : _client.post(uri,
                headers: headers, body: body == null ? null : jsonEncode(body)))
        .timeout(const Duration(seconds: 30));
    if (response.statusCode >= 400) {
      if (response.statusCode == 401) {
        throw Exception(
            'Jeton de démonstration requis. Configurez DEMO_API_TOKEN.');
      }
      throw Exception(
          'Le serveur ne peut pas traiter cette demande (${response.statusCode}).');
    }
    return jsonDecode(utf8.decode(response.bodyBytes));
  }

  Future<void> _load(
      {bool initial = false, bool silent = false, int? customerId}) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      if (!silent) _error = null;
    });
    try {
      if (initial) _customers = await _request('/customers') as List<dynamic>;
      final id = customerId ?? _selected;
      final result = await _request('/customers/$id') as Map<String, dynamic>;
      if (mounted) {
        setState(() {
          _state = result;
          _selected = id;
          _error = null;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _error =
              'Connexion impossible. Vérifiez l’API ($baseUrl) et le jeton de démonstration.';
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _mutate(String suffix, {Map<String, dynamic>? body}) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await _request('/customers/$_selected/$suffix',
          post: 'POST', body: body) as Map<String, dynamic>;
      if (mounted) setState(() => _state = result);
    } catch (_) {
      if (mounted) {
        setState(() => _error =
            'Action impossible. Vérifiez la connexion puis réessayez.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _money(dynamic value, [String currency = 'EUR']) => value == null
      ? 'Indisponible'
      : '${double.parse(value.toString()).toStringAsFixed(2).replaceAll('.', ',')} ${currency == 'EUR' ? '€' : currency}';

  Widget _insight(Map<String, dynamic> event) {
    final copy = event['personalization'] as Map<String, dynamic>;
    final confirmed = event['status'] == 'confirmed';
    final icon = switch (event['type']) {
      'FIRST_JOB' => Icons.work_outline,
      'MOVING' => Icons.home_outlined,
      _ => Icons.flight_takeoff,
    };
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
          color: confirmed ? const Color(0xFFF0F8F4) : const Color(0xFFF0F5FF),
          borderRadius: BorderRadius.circular(18)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(icon, color: brandBlue),
        const SizedBox(height: 12),
        if (confirmed)
          const Padding(
              padding: EdgeInsets.only(bottom: 8),
              child: Text('✓ Confirmé par vous',
                  style: TextStyle(color: Color(0xFF329C83), fontSize: 11))),
        Text(copy['title'] as String,
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        Text(
            confirmed
                ? 'Merci pour votre réponse. Avançons à votre rythme.'
                : copy['message'] as String,
            style: const TextStyle(height: 1.6, color: Color(0xFF64748B))),
        const SizedBox(height: 14),
        if (!confirmed)
          Wrap(spacing: 8, runSpacing: 8, children: [
            FilledButton(
                onPressed: _busy
                    ? null
                    : () => _mutate('insights/${event['id']}/feedback',
                        body: {'status': 'confirmed'}),
                child: const Text('Oui, c’est le cas')),
            OutlinedButton(
                onPressed: _busy
                    ? null
                    : () => _mutate('insights/${event['id']}/feedback',
                        body: {'status': 'dismissed'}),
                child: const Text('Non')),
          ])
        else
          TextButton.icon(
            onPressed: () => showDialog<void>(
                context: context,
                builder: (context) => AlertDialog(
                      title: Text(copy['action'] as String),
                      content: Text(copy['tip'] as String),
                      actions: [
                        TextButton(
                            onPressed: () => Navigator.pop(context),
                            child: const Text('Compris'))
                      ],
                    )),
            icon: const Icon(Icons.arrow_forward, size: 17),
            label: Text(copy['action'] as String),
          ),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    final customer = _state?['customer'] as Map<String, dynamic>?;
    final financial = _state?['financial'] as Map<String, dynamic>?;
    final events = (_state?['events'] as List<dynamic>? ?? [])
        .cast<Map<String, dynamic>>()
        .where((e) => e['status'] != 'dismissed')
        .toList();
    final transactions = _state?['transactions'] as List<dynamic>? ?? [];
    final access = _state?['consent'] as Map<String, dynamic>?;
    final permissions =
        access?['effective_permissions'] as List<dynamic>? ?? [];
    final canSimulate =
        ['accounts', 'balances', 'transactions'].every(permissions.contains);
    final suspended = _state?['kate_context']?['status'] == 'blocked';
    final currency = financial?['currency'] as String? ?? 'EUR';
    final accounts = _state?['accounts'] as List<dynamic>? ?? [];
    return Scaffold(
      appBar: AppBar(
          title: const Text('LifeFlow.',
              style: TextStyle(fontWeight: FontWeight.w800, color: brandBlue)),
          actions: [
            const Center(
                child: Text('DÉMO',
                    style: TextStyle(fontSize: 10, color: Colors.blueGrey))),
            IconButton(
                tooltip: 'Actualiser',
                onPressed:
                    _busy ? null : () => _load(initial: _customers.isEmpty),
                icon: const Icon(Icons.refresh)),
          ]),
      body: Center(
          child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 520),
              child: RefreshIndicator(
                onRefresh: () => _load(initial: _customers.isEmpty),
                child: ListView(padding: const EdgeInsets.all(24), children: [
                  if (_busy) const LinearProgressIndicator(minHeight: 2),
                  if (_error != null)
                    Container(
                        margin: const EdgeInsets.symmetric(vertical: 12),
                        padding: const EdgeInsets.all(14),
                        color: const Color(0xFFFFEBEE),
                        child: Text(_error!)),
                  if (_customers.isNotEmpty)
                    Wrap(
                        spacing: 8,
                        children: _customers
                            .map((dynamic c) => ChoiceChip(
                                  label: Text(c['name'] as String),
                                  selected: _selected == c['id'],
                                  onSelected: _busy
                                      ? null
                                      : (_) =>
                                          _load(customerId: c['id'] as int),
                                ))
                            .toList()),
                  const SizedBox(height: 28),
                  if (customer != null && financial != null) ...[
                    const Text('UN REGARD SUR VOS FINANCES',
                        style: TextStyle(
                            fontSize: 10,
                            letterSpacing: 1.7,
                            color: Colors.blueGrey)),
                    const SizedBox(height: 8),
                    Text('Bonjour ${customer['name']} ☀',
                        style: Theme.of(context).textTheme.headlineMedium),
                    const SizedBox(height: 24),
                    Container(
                        padding: const EdgeInsets.all(24),
                        decoration: BoxDecoration(
                            gradient: const LinearGradient(
                                colors: [brandBlue, Color(0xFF408AFF)]),
                            borderRadius: BorderRadius.circular(22)),
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('Disponible observé',
                                  style: TextStyle(color: Colors.white70)),
                              const SizedBox(height: 12),
                              Text(_money(financial['balance'], currency),
                                  style: const TextStyle(
                                      fontSize: 36,
                                      fontWeight: FontWeight.w700,
                                      color: Colors.white)),
                              const SizedBox(height: 16),
                              Text(
                                  'Soldes bancaires · $currency · ${_state?['analysis_date']}',
                                  style: const TextStyle(
                                      fontSize: 11, color: Colors.white70)),
                            ])),
                    if (financial['credit_limit_included'] == true ||
                        financial['credit_limit_unknown'] == true)
                      Padding(
                          padding: const EdgeInsets.only(top: 12),
                          child: Text(
                            financial['credit_limit_included'] == true
                                ? 'Le disponible inclut une limite de crédit. Il ne représente pas uniquement vos fonds propres.'
                                : 'L’inclusion éventuelle d’une limite de crédit n’est pas renseignée.',
                            style: const TextStyle(
                                fontSize: 12, color: Color(0xFF866630)),
                          )),
                    const SizedBox(height: 12),
                    Text(
                        'Solde comptabilisé : ${_money(financial['booked_balance'], currency)}',
                        style: const TextStyle(
                            fontSize: 12, color: Colors.blueGrey)),
                    if (accounts.isNotEmpty)
                      Padding(
                          padding: const EdgeInsets.only(top: 12),
                          child: Wrap(
                              spacing: 6,
                              children: accounts
                                  .map((dynamic a) => Chip(
                                        label: Text(
                                            '${a['name'] ?? 'Compte'} · ${a['currency']}',
                                            style:
                                                const TextStyle(fontSize: 10)),
                                      ))
                                  .toList())),
                    if (suspended)
                      Container(
                          margin: const EdgeInsets.only(top: 16),
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                              color: const Color(0xFFFFF4DF),
                              borderRadius: BorderRadius.circular(12)),
                          child: const Text(
                              'L’accès aux données est suspendu. Les suggestions restent masquées tant que le consentement nécessaire n’est pas actif.',
                              style: TextStyle(fontSize: 12, height: 1.6))),
                    const SizedBox(height: 26),
                    Text('Pour vous',
                        style: Theme.of(context).textTheme.titleLarge),
                    const SizedBox(height: 14),
                    if (events.isEmpty && !suspended)
                      Container(
                          padding: const EdgeInsets.all(20),
                          margin: const EdgeInsets.only(bottom: 12),
                          decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(18)),
                          child: const Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Icon(Icons.auto_awesome, color: brandBlue),
                                SizedBox(height: 12),
                                Text('À vos côtés, au bon moment.',
                                    style:
                                        TextStyle(fontWeight: FontWeight.w700)),
                                SizedBox(height: 8),
                                Text(
                                    'Vous gardez le contrôle. Les suggestions apparaissent lorsqu’un changement est détecté.',
                                    style: TextStyle(
                                        color: Colors.blueGrey, height: 1.6))
                              ])),
                    ...events.map(_insight),
                    const SizedBox(height: 12),
                    Text('Dernières opérations',
                        style: Theme.of(context).textTheme.titleLarge),
                    const SizedBox(height: 8),
                    ...transactions.take(8).map((dynamic t) => ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: CircleAvatar(
                              backgroundColor: const Color(0xFFEDF2F8),
                              child: Icon(
                                  double.parse(t['amount'].toString()) > 0
                                      ? Icons.south_west
                                      : Icons.north_east,
                                  color: Colors.blueGrey,
                                  size: 18)),
                          title: Text(t['merchant'] as String,
                              style: const TextStyle(fontSize: 13)),
                          subtitle: Text(t['date'] as String,
                              style: const TextStyle(fontSize: 10)),
                          trailing: Text(
                              _money(t['amount'],
                                  t['currency'] as String? ?? 'EUR'),
                              style: TextStyle(
                                  fontWeight: FontWeight.w600,
                                  color:
                                      double.parse(t['amount'].toString()) > 0
                                          ? const Color(0xFF329C83)
                                          : ink)),
                        )),
                    const Divider(height: 36),
                    const Text('COMMANDES DE DÉMONSTRATION',
                        style: TextStyle(
                            fontSize: 10,
                            color: Colors.blueGrey,
                            letterSpacing: 1)),
                    const SizedBox(height: 12),
                    Wrap(spacing: 8, runSpacing: 8, children: [
                      FilledButton.icon(
                          onPressed: _busy ||
                                  !canSimulate ||
                                  customer['simulated'] == true
                              ? null
                              : () => _mutate('simulate'),
                          icon: const Icon(Icons.play_arrow),
                          label: Text(customer['simulated'] == true
                              ? 'Septembre simulé'
                              : 'Simuler septembre')),
                      OutlinedButton(
                          onPressed: _busy || !canSimulate
                              ? null
                              : () => _mutate('reset'),
                          child: const Text('Réinitialiser')),
                    ]),
                    const SizedBox(height: 24),
                    const Text(
                        'Profils fictifs · Aperçu local pour Kate\nAucun appel à Kate. Sans affiliation officielle à KBC.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                            fontSize: 10, color: Colors.blueGrey, height: 1.7)),
                  ],
                ]),
              ))),
    );
  }
}

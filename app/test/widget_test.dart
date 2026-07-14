// Shell smoke test — the real game logic is tested headlessly in
// tool/test_engine.js at the repo root; the WebView itself can't be
// meaningfully widget-tested.
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('placeholder', () {
    expect(true, isTrue);
  });
}
